import { create } from 'zustand';
import type {
  MenuCategoryWithItems, MenuItemWithDetails, Order, OrderWithDetails,
} from '@paxrest/shared-types';
import { api } from '@/lib/supabase';

/* ═══════════════════════════════════════════════════
   POS Cart Store — manages the active order being built
   ═══════════════════════════════════════════════════ */

export interface CartItemExtra { id: string; name: string; price: number }
export interface CartItemRemovedIngredient { ingredient_id: string; name: string; cost_contribution: number }

export interface CartItem {
  menuItemId: string;
  variantId?: string;
  name: string;
  variantName?: string;
  basePrice: number;
  quantity: number;
  modifiers: { id: string; name: string; price: number }[];
  notes?: string;
  removedIngredients?: CartItemRemovedIngredient[];
  selectedExtras?: CartItemExtra[];
}

interface CartState {
  items: CartItem[];
  orderType: 'dine_in' | 'takeaway' | 'delivery' | 'pickup';
  tableId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string;
  discountPercent: number;
  redeemPoints: number;
}

interface CartActions {
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  removeItem: (menuItemId: string, variantId?: string) => void;
  updateQuantity: (menuItemId: string, qty: number, variantId?: string) => void;
  updateItemNotes: (menuItemId: string, notes: string, variantId?: string) => void;
  setOrderType: (t: CartState['orderType']) => void;
  setTable: (tableId: string | null) => void;
  setCustomer: (id: string | null, name: string | null, phone: string | null) => void;
  setNotes: (notes: string) => void;
  setDiscount: (pct: number) => void;
  setRedeemPoints: (pts: number) => void;
  clearCart: () => void;
  subtotal: () => number;
  total: () => number;
  itemCount: () => number;
}

const initialCart: CartState = {
  items: [], orderType: 'dine_in', tableId: null,
  customerId: null, customerName: null, customerPhone: null,
  notes: '', discountPercent: 0, redeemPoints: 0,
};

export const useCartStore = create<CartState & CartActions>((set, get) => ({
  ...initialCart,

  addItem: (item) => set((s) => {
    const key = `${item.menuItemId}_${item.variantId ?? ''}`;
    const existing = s.items.find(
      (i) => `${i.menuItemId}_${i.variantId ?? ''}` === key
        && JSON.stringify(i.modifiers) === JSON.stringify(item.modifiers)
        && JSON.stringify(i.removedIngredients ?? []) === JSON.stringify(item.removedIngredients ?? [])
        && JSON.stringify(i.selectedExtras ?? []) === JSON.stringify(item.selectedExtras ?? []),
    );
    if (existing) {
      return { items: s.items.map((i) => i === existing ? { ...i, quantity: i.quantity + 1 } : i) };
    }
    return { items: [...s.items, { ...item, quantity: 1 }] };
  }),

  removeItem: (menuItemId, variantId) => set((s) => ({
    items: s.items.filter((i) => !(i.menuItemId === menuItemId && (i.variantId ?? '') === (variantId ?? ''))),
  })),

  updateQuantity: (menuItemId, qty, variantId) => set((s) => ({
    items: qty <= 0
      ? s.items.filter((i) => !(i.menuItemId === menuItemId && (i.variantId ?? '') === (variantId ?? '')))
      : s.items.map((i) =>
          i.menuItemId === menuItemId && (i.variantId ?? '') === (variantId ?? '')
            ? { ...i, quantity: qty } : i,
        ),
  })),

  updateItemNotes: (menuItemId, notes, variantId) => set((s) => ({
    items: s.items.map((i) =>
      i.menuItemId === menuItemId && (i.variantId ?? '') === (variantId ?? '')
        ? { ...i, notes } : i,
    ),
  })),

  setOrderType: (orderType) => set({ orderType, tableId: orderType !== 'dine_in' ? null : get().tableId }),
  setTable: (tableId) => set({ tableId }),
  setCustomer: (id, name, phone) => set({ customerId: id, customerName: name, customerPhone: phone }),
  setNotes: (notes) => set({ notes }),
  setDiscount: (discountPercent) => set({ discountPercent: Math.max(0, Math.min(100, discountPercent)) }),
  setRedeemPoints: (redeemPoints) => set({ redeemPoints: Math.max(0, redeemPoints) }),
  clearCart: () => set(initialCart),

  subtotal: () => get().items.reduce((sum, i) => {
    const modTotal = i.modifiers.reduce((m, mod) => m + mod.price, 0);
    const extrasTotal = (i.selectedExtras ?? []).reduce((s, e) => s + e.price, 0);
    const ingredientsDiscount = (i.removedIngredients ?? []).reduce((s, r) => s + r.cost_contribution, 0);
    return sum + (i.basePrice + modTotal + extrasTotal - ingredientsDiscount) * i.quantity;
  }, 0),

  total: () => {
    const sub = get().subtotal();
    const disc = sub * (get().discountPercent / 100);
    return Math.max(0, sub - disc);
  },

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));

/* ═══════════════════════════════════════════════════
   Menu Store — caches menu data for POS
   ═══════════════════════════════════════════════════ */

interface MenuState {
  categories: MenuCategoryWithItems[];
  loading: boolean;
  lastFetched: number | null;
}

interface MenuActions {
  fetchMenu: (branchId: string) => Promise<void>;
}

export const useMenuStore = create<MenuState & MenuActions>((set, get) => ({
  categories: [],
  loading: false,
  lastFetched: null,

  fetchMenu: async (branchId: string) => {
    // Cache for 5 minutes
    if (get().lastFetched && Date.now() - get().lastFetched! < 5 * 60_000) return;
    set({ loading: true });
    try {
      const data = await api<{ menu: MenuCategoryWithItems[] }>('menu', 'full', { params: {}, branchId });
      set({ categories: data.menu ?? [], loading: false, lastFetched: Date.now() });
    } catch (err) {
      console.error('Failed to load menu:', err);
      set({ loading: false });
    }
  },
}));

/* ═══════════════════════════════════════════════════
   Available Meals Store — kitchen-prepared meals
   ═══════════════════════════════════════════════════ */

export interface MealIngredient {
  id: string;
  name: string;
  quantity_used: number;
  unit: string;
  cost_contribution: number;
}

export interface MealExtra {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
}

export interface AvailableMeal {
  id: string;
  menu_item_id: string;
  menu_item_name?: string;
  quantity_available: number;
  menu_items?: {
    name: string;
    base_price: number;
    media_url?: string;
    menu_item_ingredients?: MealIngredient[];
    menu_item_extras?: MealExtra[];
  };
}

interface AvailableMealsState {
  meals: AvailableMeal[];
  loading: boolean;
}

interface AvailableMealsActions {
  fetchMeals: (branchId: string) => Promise<void>;
}

export const useAvailableMealsStore = create<AvailableMealsState & AvailableMealsActions>((set) => ({
  meals: [],
  loading: false,

  fetchMeals: async (branchId: string) => {
    set({ loading: true });
    try {
      const data = await api<{ meals: AvailableMeal[] }>('kitchen', 'available-meals', { params: {}, branchId });
      set({ meals: data.meals ?? [], loading: false });
    } catch (err) {
      console.error('Failed to load available meals:', err);
      set({ loading: false });
    }
  },
}));
