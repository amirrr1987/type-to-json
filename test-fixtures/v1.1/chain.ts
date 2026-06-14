export interface IGrand {
  g: string
}

export interface IParent extends IGrand {
  p: string
}

export interface IChild extends IParent {
  c: string
}
