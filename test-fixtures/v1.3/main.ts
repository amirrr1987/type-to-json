export interface IUser {
  id: number
  fullName: string
}

export interface IPermissions {
  permissionList: string[]
}

export interface IApiResponse<T> {
  data: T
  message: string
  statusCode: number
}

export type IAdmin = IUser & IPermissions & {
  adminLevel: number
}

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}

export interface IUserWithRole {
  role: UserRole
  id: number
}
