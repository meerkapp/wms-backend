import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

type SocketIoOptions = Partial<ServerOptions>;

export function withAllowedSocketOrigin(
  frontendOrigin: string,
  options: SocketIoOptions = {},
): SocketIoOptions {
  const existingCors =
    typeof options.cors === 'object' && options.cors !== null ? options.cors : {};

  return {
    ...options,
    cors: {
      ...existingCors,
      origin: frontendOrigin,
    },
  };
}

export class ConfiguredSocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly frontendOrigin: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, withAllowedSocketOrigin(this.frontendOrigin, options));
  }
}
