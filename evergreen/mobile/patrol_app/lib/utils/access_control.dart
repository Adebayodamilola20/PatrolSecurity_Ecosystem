import '../models/user.dart';

enum AccountRole { admin, client, site }

extension AccountRoleLabel on AccountRole {
  String get label {
    switch (this) {
      case AccountRole.admin:
        return 'Admin';
      case AccountRole.client:
        return 'Client Account';
      case AccountRole.site:
        return 'Site Account';
    }
  }

  String get scopeLabel {
    switch (this) {
      case AccountRole.admin:
        return 'All clients and all sites';
      case AccountRole.client:
        return 'Assigned client sites';
      case AccountRole.site:
        return 'One assigned site';
    }
  }
}

AccountRole roleFromString(String role) {
  final normalized = role
      .trim()
      .toLowerCase()
      .replaceAll('-', '_')
      .replaceAll(' ', '_');
  if (normalized == 'admin' || normalized == 'super_admin') {
    return AccountRole.admin;
  }
  if (normalized == 'main_account' ||
      normalized == 'client' ||
      normalized == 'client_account' ||
      normalized == 'client_main') {
    return AccountRole.client;
  }
  return AccountRole.site;
}

AccountRole roleForUser(User? user) => roleFromString(user?.role ?? 'guard');

bool canSubmitPatrol(User? user) => roleForUser(user) == AccountRole.site;

bool canViewGlobalReports(User? user) {
  final role = roleForUser(user);
  return role == AccountRole.admin || role == AccountRole.client;
}
