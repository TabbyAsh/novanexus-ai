import 'server-only';
import { cookies } from 'next/headers';
import { verifyWorldToken, WORLD_COOKIE } from './access';

export async function readWorldSession() {
  const token = (await cookies()).get(WORLD_COOKIE)?.value;
  return verifyWorldToken(token);
}
