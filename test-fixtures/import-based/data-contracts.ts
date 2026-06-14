export interface LoginRequestDTO {
  username: string
  password: string
}

export interface LoginResponseResultDTO {
  data: LoginResponseDataDTO
  success: boolean
}

export interface LoginResponseDataDTO {
  access_token: string
  expires_in: number
  refresh_token?: string
}
