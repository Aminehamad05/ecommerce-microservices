export interface AuthUser {
  id: string;
  email: string;
  role: "customer" | "admin";
}

export interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

export interface DomainEvent<T extends string = string, P = unknown> {
  /** e.g. "user.created" */
  readonly type: T;
  readonly payload: P;
  readonly occurredAt: string;
  /** correlation id propagated across services */
  readonly correlationId: string;
}

export interface HttpErrorShape {
  status: number;
  message: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
