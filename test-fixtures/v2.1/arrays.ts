export interface IOrderItem {
  productId: string
  quantity: number
}

export interface IOrderList {
  items: IOrderItem[]
}
