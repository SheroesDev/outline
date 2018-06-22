// @flow
import { User } from '../models';

type Options = {
  includeDetails?: boolean,
};

type UserPresentation = {
  id: string,
  username: string,
  name: string,
  avatarUrl: ?string,
  email?: string,
  isAdmin?: boolean,
};

export default (
  ctx: Object,
  user: User,
  options: Options = {}
): UserPresentation => {
  const userData = {};
  userData.id = user.id;
  userData.createdAt = user.createdAt;
  userData.username = user.username;
  userData.name = user.name;
  userData.avatarUrl =
    user.avatarUrl || (user.slackData ? user.slackData.image_192 : null);

  if (options.includeDetails) {
    userData.email = user.email;
    userData.isAdmin = user.isAdmin;
    userData.isSuspended = user.isSuspended;
  }

  return userData;
};
