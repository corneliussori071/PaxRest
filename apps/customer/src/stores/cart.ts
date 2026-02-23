import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  menuItemId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  variantPriceAdjustment?: number;
  basePrice: number;
  quantity: number;
  modifiers: { id: string; name: string; price: number; groupName?: string }[];
  notes?: string;
  imageUrl?: string;
}

interface DeliveryAddr {
  line1: string;
  city: string;
  lat: number;
  lng: number;
}

interface CartState {
  companyId: string | null;
  branchId: string | null;
  branchName: string | null;
  items: CartItem[];
  orderType: 'delivery' | 'pickup' | 'dine_in';
  deliveryAddress: DeliveryAddr | null;
  deliveryZoneId: string | null;
  deliveryFee: number;
  customerName: string;
  customerPhone: string;
  notes: string;
  subtotal: number;
  total: number;
  itemCount: number;
}

interface CartActions {
  setBranch: (companyId: string, branchId: string, branchName: string) => void;
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, qty: number) => void;
  setOrderType: (t: CartState['orderType']) => void;
  setDeliveryAddress: (addr: DeliveryAddr) => void;
  setDeliveryZone: (zoneId: string | null, fee: number) => void;
  setCustomerName: (name: string) => void;
  setCustomerPhone: (phone: string) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
}

function computeDerived(items: CartItem[], orderType: string, deliveryFee: number) {
  const subtotal = items.reduce((sum, i) => {
    const modTotal = i.modifiers.reduce((m, mod) => m + mod.price, 0);
    return sum + (i.basePrice + (i.variantPriceAdjustment ?? 0) + modTotal) * i.quantity;
  }, 0);
  const total = subtotal + (orderType === 'delivery' ? deliveryFee : 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  return { subtotal, total, itemCount };
}

const initialState: Omit<CartState, 'subtotal' | 'total' | 'itemCount'> = {
  companyId: null, branchId: null, branchName: null,
  items: [], orderType: 'delivery',
  deliveryAddress: null, deliveryZoneId: null, deliveryFee: 0,
  customerName: '', customerPhone: '', notes: '',
};

export const useCartStore = create<CartState & CartActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      subtotal: 0, total: 0, itemCount: 0,

      setBranch: (companyId, branchId, branchName) => {
        const items: CartItem[] = [];
        set({ companyId, branchId, branchName, items, ...computeDerived(items, get().orderType, get().deliveryFee) });
      },

      addItem: (item) => set((s) => {
        const items = [...s.items, item];
        return { items, ...computeDerived(items, s.orderType, s.deliveryFee) };
      }),

      removeItem: (index) => set((s) => {
        const items = s.items.filter((_, i) => i !== index);
        return { items, ...computeDerived(items, s.orderType, s.deliveryFee) };
      }),

      updateQuantity: (index, qty) => set((s) => {
        const items = qty <= 0
          ? s.items.filter((_, i) => i !== index)
          : s.items.map((item, i) => i === index ? { ...item, quantity: qty } : item);
        return { items, ...computeDerived(items, s.orderType, s.deliveryFee) };
      }),

      setOrderType: (orderType) => set((s) => ({
        orderType,
        ...computeDerived(s.items, orderType, s.deliveryFee),
      })),
      setDeliveryAddress: (deliveryAddress) => set({ deliveryAddress }),
      setDeliveryZone: (deliveryZoneId, deliveryFee) => set((s) => ({
        deliveryZoneId, deliveryFee,
        ...computeDerived(s.items, s.orderType, deliveryFee),
      })),
      setCustomerName: (customerName) => set({ customerName }),
      setCustomerPhone: (customerPhone) => set({ customerPhone }),
      setNotes: (notes) => set({ notes }),
      clearCart: () => set({ ...initialState, subtotal: 0, total: 0, itemCount: 0 }),
    }),
    { name: 'paxrest-cart' },
  ),
);
