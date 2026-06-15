import type { LoginRequestDTO, LoginResponseResultDTO } from '../data-contracts'

export type IAuthLoginReq = LoginRequestDTO
export type IAuthLoginRes = LoginResponseResultDTO['data']

export interface IAuthProfile {
  id: string
  fullName: string
  email: string
}
