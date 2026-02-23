import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import {
  corsResponse, jsonResponse, errorResponse,
  createServiceClient, getStripe, getWebhookSecret,
} from '../_shared/index.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const url = new URL(req.url);
  const action = url.pathname.split('/').filter(Boolean).pop();

  try {
    switch (action) {
      case 'webhook':
        return await handleWebhook(req);
      case 'create-checkout':
        return await createCheckoutSession(req);
      case 'create-portal':
        return await createPortalSession(req);
      default:
        return errorResponse('Unknown stripe action', 404);
    }
  } catch (err) {
    console.error('Stripe error:', err);
    return errorResponse(err.message ?? 'Internal server error', 500);
  }
});

/* ─────────── Webhook Handler ─────────── */
async function handleWebhook(req: Request) {
  const stripe = getStripe();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return errorResponse('Missing stripe-signature', 400);

  const body = await req.text();
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, getWebhookSecret());
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return errorResponse('Invalid signature', 400);
  }

  const supabase = createServiceClient();

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(supabase, event.data.object);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(supabase, event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(supabase, event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(supabase, event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(supabase, event.data.object);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return jsonResponse({ received: true });
}

async function handleCheckoutCompleted(supabase: any, session: any) {
  const companyId = session.metadata?.company_id;
  const packageId = session.metadata?.package_id;
  if (!companyId) return;

  // Record payment
  await supabase.from('subscription_payments').insert({
    company_id: companyId,
    package_id: packageId,
    stripe_payment_id: session.payment_intent ?? session.subscription,
    amount: session.amount_total / 100,
    currency: session.currency ?? 'usd',
    status: 'completed',
    period_start: new Date().toISOString(),
    period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Update company subscription
  if (packageId) {
    const { data: pkg } = await supabase
      .from('subscription_packages')
      .select('tier')
      .eq('id', packageId)
      .single();

    if (pkg) {
      await supabase.from('companies').update({
        subscription_tier: pkg.tier,
        subscription_status: 'active',
        current_package_id: packageId,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
      }).eq('id', companyId);
    }
  }
}

async function handleInvoicePaid(supabase: any, invoice: any) {
  const customerId = invoice.customer;
  const { data: company } = await supabase
    .from('companies')
    .select('id, current_package_id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!company) return;

  await supabase.from('subscription_payments').insert({
    company_id: company.id,
    package_id: company.current_package_id,
    stripe_payment_id: invoice.payment_intent,
    amount: invoice.amount_paid / 100,
    currency: invoice.currency ?? 'usd',
    status: 'completed',
    period_start: new Date(invoice.period_start * 1000).toISOString(),
    period_end: new Date(invoice.period_end * 1000).toISOString(),
  });

  await supabase.from('companies').update({ subscription_status: 'active' })
    .eq('id', company.id);
}

async function handlePaymentFailed(supabase: any, invoice: any) {
  const customerId = invoice.customer;
  await supabase.from('companies').update({ subscription_status: 'past_due' })
    .eq('stripe_customer_id', customerId);
}

async function handleSubscriptionUpdated(supabase: any, subscription: any) {
  const customerId = subscription.customer;
  const status = subscription.status === 'active' ? 'active' : subscription.status;

  await supabase.from('companies').update({
    subscription_status: status,
    stripe_subscription_id: subscription.id,
  }).eq('stripe_customer_id', customerId);
}

async function handleSubscriptionDeleted(supabase: any, subscription: any) {
  const customerId = subscription.customer;
  await supabase.from('companies').update({
    subscription_status: 'cancelled',
    subscription_tier: 'free',
  }).eq('stripe_customer_id', customerId);
}

/* ─────────── Checkout Session ─────────── */
async function createCheckoutSession(req: Request) {
  // This endpoint needs auth — we import manually for this action
  const { createUserClient, requireAuth } = await import('../_shared/index.ts');
  const supabase = createUserClient(req);
  const authResult = await requireAuth(supabase, req);
  if (authResult instanceof Response) return authResult;
  const auth = authResult as any;

  const body = await req.json();
  if (!body.package_id) return errorResponse('Missing package_id');

  const { data: pkg, error: pkgErr } = await supabase
    .from('subscription_packages')
    .select('*')
    .eq('id', body.package_id)
    .eq('is_active', true)
    .single();
  if (pkgErr || !pkg) return errorResponse('Package not found', 404);

  const stripe = getStripe();

  // Find or create Stripe customer
  const svcClient = createServiceClient();
  const { data: company } = await svcClient
    .from('companies').select('stripe_customer_id, name').eq('id', auth.companyId).single();

  let customerId = company?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.email,
      name: company?.name ?? 'Company',
      metadata: { company_id: auth.companyId },
    });
    customerId = customer.id;
    await svcClient.from('companies').update({ stripe_customer_id: customerId })
      .eq('id', auth.companyId);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: pkg.stripe_price_id ? 'subscription' : 'payment',
    line_items: [
      pkg.stripe_price_id
        ? { price: pkg.stripe_price_id, quantity: 1 }
        : { price_data: { currency: 'usd', unit_amount: Math.round(pkg.price * 100), product_data: { name: pkg.name } }, quantity: 1 },
    ],
    metadata: { company_id: auth.companyId, package_id: body.package_id },
    success_url: `${Deno.env.get('APP_URL_POS') ?? 'http://localhost:5173'}/settings/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${Deno.env.get('APP_URL_POS') ?? 'http://localhost:5173'}/settings/billing`,
  });

  return jsonResponse({ url: session.url });
}

/* ─────────── Customer Portal ─────────── */
async function createPortalSession(req: Request) {
  const { createUserClient, requireAuth } = await import('../_shared/index.ts');
  const supabase = createUserClient(req);
  const authResult = await requireAuth(supabase, req);
  if (authResult instanceof Response) return authResult;
  const auth = authResult as any;

  const svcClient = createServiceClient();
  const { data: company } = await svcClient
    .from('companies').select('stripe_customer_id').eq('id', auth.companyId).single();
  if (!company?.stripe_customer_id) return errorResponse('No billing account found');

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripe_customer_id,
    return_url: `${Deno.env.get('APP_URL_POS') ?? 'http://localhost:5173'}/settings/billing`,
  });

  return jsonResponse({ url: session.url });
}
