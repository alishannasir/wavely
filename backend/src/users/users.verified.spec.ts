import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';

function setup(user: object) {
  const prisma: any = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u', ...user }),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'u', ...user, ...data })),
    },
  };
  return { svc: new UsersService(prisma), prisma };
}

const verified = { idVerifiedAt: new Date(), gender: 'FEMALE', birthdate: new Date('1995-05-05') };

describe('profile after an identity check', () => {
  it('refuses a different gender or date of birth', async () => {
    const { svc } = setup(verified);
    await expect(svc.updateProfile('u', { gender: 'MALE' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.updateProfile('u', { birthdate: '1990-01-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('still saves the form when those fields are sent unchanged, and never writes them', async () => {
    const { svc, prisma } = setup(verified);
    await svc.updateProfile('u', { displayName: 'Aliya', gender: 'FEMALE', birthdate: '1995-05-05' });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.displayName).toBe('Aliya');
    expect(data.gender).toBeUndefined();
    expect(data.birthdate).toBeUndefined();
  });
  it('before verification the fields stay editable', async () => {
    const { svc, prisma } = setup({ idVerifiedAt: null, gender: 'OTHER', birthdate: new Date('1995-05-05') });
    await svc.updateProfile('u', { gender: 'MALE' });
    expect(prisma.user.update.mock.calls[0][0].data.gender).toBe('MALE');
  });
});
