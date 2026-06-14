namespace API {
  export interface IUser {
    id: number
    fullName: string
  }

  export interface IProduct {
    id: number
    title: string
  }
}

export interface IOutsideNamespace {
  ignored: boolean
}
