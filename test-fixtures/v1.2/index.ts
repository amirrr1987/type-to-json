export { IUser } from './user.interface'
export { IProduct } from './product.interface'

export type IUserForm = Omit<IUser, 'id' | 'createdAt'>
export type IUserPreview = Pick<IUser, 'id' | 'fullName'>
export type IUserUpdate = Partial<IUser>

export interface IResponse {
  status: 'success' | 'error' | 'pending'
  data: IUser | IProduct | null
}

import type { IUser } from './user.interface'
