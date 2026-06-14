export interface IUser {
  id: number
  fullName: string
  permissionList: string[]
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

export type IAdminResponse = IApiResponse<IAdmin>

export class UserService implements IUser {
  id = 1
  fullName = 'test'
  permissionList = ['read']
}
