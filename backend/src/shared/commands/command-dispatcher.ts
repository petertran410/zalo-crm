import { Command, CommandHandler, CommandValidator, CommandResponse } from './command.interface.js';
import { logger } from '../utils/logger.js';

class CommandDispatcher {
  private handlers = new Map<string, CommandHandler>();
  private validators = new Map<string, CommandValidator>();

  register(commandName: string, handler: CommandHandler, validator?: CommandValidator) {
    this.handlers.set(commandName, handler);
    if (validator) {
      this.validators.set(commandName, validator);
    }
  }

  async dispatch<TResult = any>(
    command: Command,
    context: { orgId: string; userId: string }
  ): Promise<CommandResponse<TResult>> {
    const { name, payload } = command;
    logger.info(`[CommandDispatcher] Dispatching command: ${name} for org ${context.orgId}`);

    const validator = this.validators.get(name);
    if (validator) {
      try {
        const validationResult = await validator.validate(command);
        if (!validationResult.isValid) {
          logger.warn(`[CommandDispatcher] Validation failed for command ${name}:`, validationResult.errors);
          return {
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: validationResult.errors,
          };
        }
      } catch (err: any) {
        logger.error(`[CommandDispatcher] Validator error for command ${name}:`, err);
        return {
          success: false,
          message: 'Lỗi kiểm tra dữ liệu đầu vào: ' + (err.message || String(err)),
        };
      }
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      logger.error(`[CommandDispatcher] No handler found for command ${name}`);
      return {
        success: false,
        message: `Command '${name}' không được hỗ trợ hệ thống`,
      };
    }

    try {
      const result = await handler.handle(command, context);
      return {
        success: true,
        message: 'Thao tác thực hiện thành công',
        data: result,
      };
    } catch (err: any) {
      logger.error(`[CommandDispatcher] Handler error for command ${name}:`, err);
      return {
        success: false,
        message: err.message || 'Lỗi hệ thống xảy ra trong quá trình xử lý',
      };
    }
  }
}

export const commandDispatcher = new CommandDispatcher();
export default commandDispatcher;
