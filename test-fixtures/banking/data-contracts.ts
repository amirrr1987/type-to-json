export interface ILoginResponseDTO {
  access_token: string
  expires_in: number
  refresh_token?: string
  'not-before-policy'?: number
}

export interface ILoginResponseResultDTO {
  data?: ILoginResponseDTO
  isSuccess?: boolean
  message?: string
  statusCode?: number
}

export interface IAccountBalanceDto {
  accountId: string
  balance: number
  currency?: string
}

export interface IAccountBalanceDtoResultDTO {
  data?: IAccountBalanceDto
  isSuccess?: boolean
  message?: string
}

export interface IBooleanResultDTO {
  data?: boolean
  isSuccess?: boolean
}
