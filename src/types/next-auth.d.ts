import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    username?: string;
    role?: "STAFF" | "ADMIN";
    mustChangePassword?: boolean;
    /** Staff.sessionVersion at the moment of login. */
    sv?: number;
  }

  interface Session {
    user: {
      id: string;
      username: string;
      role: "STAFF" | "ADMIN";
      mustChangePassword: boolean;
      sv: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: "STAFF" | "ADMIN";
    mustChangePassword?: boolean;
    sv?: number;
  }
}
