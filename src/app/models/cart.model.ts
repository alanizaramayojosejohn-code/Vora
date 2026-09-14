import { RegisterProductItem } from '../services/order/order.service';

// Ítem del carrito de la venta en curso (POS). No es OrderItem: todavía no es
// un pedido, y necesita datos que un OrderItem no tiene (stock disponible,
// imagen) para pintar el catálogo y el ticket antes de registrar la venta.
export interface CartItem {
  product_id: string;
  product_name: string;
  category: string | null;
  unit_price: number;
  stock_available: number;
  has_stock: boolean;
  quantity: number;
  // Solo para la miniatura del ticket (RF-7 rediseño): viaja con el ítem
  // porque el producto puede salir del catálogo (filtro, página) antes de
  // que el carrito se vacíe.
  image_url: string | null;
}

// Suma de unit_price * quantity. La usan tanto el subtotal del carrito como el
// total de una operación de la cola offline (mismo cálculo, dos orígenes).
export function sumLineTotal(items: Pick<CartItem, 'unit_price' | 'quantity'>[]): number {
  return items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
}

export function cartSubtotal(cart: CartItem[]): number {
  return sumLineTotal(cart);
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.length;
}

export function cartTotalQuantity(cart: CartItem[]): number {
  return cart.reduce((sum, i) => sum + i.quantity, 0);
}

export function cashChange(cashReceived: number, subtotal: number): number {
  return cashReceived - subtotal;
}

// Tope de stock por ítem: con has_stock en false el producto es "libre"
// (sin control de inventario) y nunca llega al tope.
export function itemAtMax(item: Pick<CartItem, 'has_stock' | 'quantity' | 'stock_available'>): boolean {
  return item.has_stock && item.quantity >= item.stock_available;
}

// Cantidad de un producto ya en el carrito, para resaltar su tarjeta en el
// catálogo (rediseño). 0 si no está.
export function cartQuantityFor(cart: CartItem[], productId: string): number {
  return cart.find((i) => i.product_id === productId)?.quantity ?? 0;
}

// El carrito tal como lo espera el servidor (y la cola offline): sin los
// campos que solo existen para pintar el catálogo/ticket.
export function toRegisterItems(cart: CartItem[]): RegisterProductItem[] {
  return cart.map((item) => ({
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
  }));
}
