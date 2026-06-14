import type { LoginRequestDTO, LoginResponseDataDTO } from './data-contracts'

export type IAuthLoginReq = LoginRequestDTO
export type IAuthLoginRes = LoginResponseDataDTO

export interface IAuthProfile {
  id: string
  fullName: string
  email: string
}

interface IInternalOnly {
  secret: string
}

type INonExportedAlias = LoginRequestDTO
