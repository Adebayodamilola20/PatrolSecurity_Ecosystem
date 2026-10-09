class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final String phone;
  final bool active;
  final String? lastActive;
  /// Signed, short-lived picture URL from the server. Not persisted: it
  /// expires, so it is refetched from /auth/me each time the app opens.
  final String? photoUrl;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.role = 'officer',
    this.phone = '',
    this.active = true,
    this.lastActive,
    this.photoUrl,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] ?? '',
    name: json['name'] ?? '',
    email: json['email'] ?? '',
    role: json['role'] ?? 'officer',
    phone: json['phone'] ?? '',
    active: json['active'] == true || json['active'] == 1,
    lastActive: json['lastActive'],
    photoUrl: json['photoUrl'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'role': role,
    'phone': phone,
    'active': active,
    'lastActive': lastActive,
  };
}
