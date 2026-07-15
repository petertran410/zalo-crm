export interface Command<TPayload = any> {
  name: string;
  payload: TPayload;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: Record<string, string>;
}

export interface CommandValidator<T extends Command = Command> {
  validate(command: T): Promise<ValidationResult> | ValidationResult;
}

export interface CommandHandler<T extends Command = Command, TResult = any> {
  handle(command: T, context: { orgId: string; userId: string }): Promise<TResult>;
}

export interface CommandResponse<TData = any> {
  success: boolean;
  message: string;
  data?: TData;
  errors?: Record<string, string>;
}
