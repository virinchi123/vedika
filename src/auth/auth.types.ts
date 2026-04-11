export type PublicUser = {
  id: string;
  emailAddress: string;
  phoneNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthenticatedRequestUser = PublicUser & {
  sessionId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedRequestUser;
    }
  }
}

export {};
