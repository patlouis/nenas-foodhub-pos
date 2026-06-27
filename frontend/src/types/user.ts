export type Role = "admin" | "cashier"

export interface User {
  _id: string
  name: string
  email: string
  role: Role
  createdAt?: string
  updatedAt?: string
}

// Shape used when registering a user (password is sent, never stored client-side)
export interface NewUser {
  name: string
  email: string
  password: string
  role: Role
}
