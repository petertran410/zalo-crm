import { describe, expect, it } from 'vitest';
import { CreateCustomerValidator } from '../src/modules/pos/commands/customer-commands.js';

const validator = new CreateCustomerValidator();

function validate(address?: string) {
  return validator.validate({
    name: 'CreateCustomer',
    payload: {
      name: 'Test customer',
      phone: '0987654321',
      ...(address === undefined ? {} : { address }),
    },
  });
}

describe('CreateCustomerValidator address', () => {
  it('requires an address', () => {
    expect(validate().errors?.address).toBeTruthy();
  });

  it('rejects whitespace-only addresses', () => {
    expect(validate('   ').errors?.address).toBeTruthy();
  });

  it('accepts a populated address', () => {
    expect(validate('12 Example Street').isValid).toBe(true);
  });
});
