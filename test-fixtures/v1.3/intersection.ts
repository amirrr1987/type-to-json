export interface IA {
  label: string
}

export interface IB {
  label: number
  extra: string
}

export type IMerged = IA & IB
