export interface LoginRequestDTO {
  username: string
  password: string
}

export interface LoginResponseDTO {
  access_token: string
  expires_in: number
  refresh_token?: string
}

export interface LoginResponseResultDTO {
  data?: LoginResponseDTO
  isSuccess?: boolean
  message?: string
  statusCode?: number
}
