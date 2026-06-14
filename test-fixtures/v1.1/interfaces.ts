export interface IBase {
  id: number
}

export interface IAudit {
  createdAt: string
}

export interface ISoftDelete {
  deletedAt: string | null
}

export interface IUser extends IBase, IAudit, ISoftDelete {
  fullName: string
}

export interface IOptionalUser {
  id: number
  nickname?: string
}

export interface IReadonlyUser {
  readonly id: number
  fullName: string
}
