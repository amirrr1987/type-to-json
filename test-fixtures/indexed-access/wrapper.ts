export interface WrapperDTO {
  data: InnerDTO
  ok: boolean
}

export interface InnerDTO {
  token: string
  userId: number
}
