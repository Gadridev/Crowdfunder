import jwt, { type SignOptions } from "jsonwebtoken";

export function signToken(id: string): string {
  const options: SignOptions = {
    expiresIn: process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign({ id }, process.env.JWT_SECRET!, options);
}
