
/** Request body for POST /auth/login */
export type IAuthLoginReq = {
  username: string
  password: string
}

/** Unwrapped `data` field from the login response */
export type IAuthLoginRes = {
  access_token: string
  expires_in: number
  refresh_token?: string
}
