export class CustomError extends Error {
  status: number;

  constructor(message: any, status: any) {
    super(message);
    this.status = status || 500;
  }
}