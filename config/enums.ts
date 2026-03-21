class Enum<T extends string | number | boolean> {
  public value: T;
  public key: string;
  constructor(name: string, value: T) {
    this.value = value;
    this.key = name;
  }
  getValue(): T {
    return this.value;
  }
  getKey(): string {
    return this.key;
  }
}

/**
 * 全局枚举（与环境无关）
 */
const enums = {
  USER: {
    BELONG_PLACE_TO_CITY: {
      BEIJING: new Enum<number>("北京", 1),
      SHANGHAI: new Enum<number>("上海", 2),
      GUANGZHOU: new Enum<number>("广州", 3),
      SHENZHEN: new Enum<number>("深圳", 4),
    },
    STATUS: {
      RESIGNED: new Enum<number>("已离职", 0),
      EMPLOYED: new Enum<number>("在职", 1),
    },
  },
} as const;

export { Enum, enums };
