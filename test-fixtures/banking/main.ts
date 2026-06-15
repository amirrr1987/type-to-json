import type {
  ILoginResponseResultDTO,
  IAccountBalanceDtoResultDTO,
  IBooleanResultDTO,
} from './data-contracts'

export type IAuthLoginRes = ILoginResponseResultDTO['data']
export type IAccountBalanceRes = IAccountBalanceDtoResultDTO['data']
export type IBooleanUnwrapped = IBooleanResultDTO['data']
