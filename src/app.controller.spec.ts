import { AppController } from './app.controller';

describe('AppController', () => {
  it('exposes the same release version in the manifest and healthcheck', () => {
    const controller = new AppController();

    expect(controller.healthcheck()).toEqual({
      status: 'ok',
      version: controller.manifest().version,
    });
  });
});
