class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final String phone;
  final bool active;
  final String? lastActive;

  User({
    required this.id,
    required this.name,
    required this.email,
    this.role = 'officer',
    this.phone = '',
    this.active = true,
    this.lastActive,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] ?? '',
    name: json['name'] ?? '',
    email: json['email'] ?? '',
    role: json['role'] ?? 'officer',
    phone: json['phone'] ?? '',
    active: json['active'] == true || json['active'] == 1,
    lastActive: json['lastActive'],
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
