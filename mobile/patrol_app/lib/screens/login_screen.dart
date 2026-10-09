import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/duty_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = context.read<AuthProvider>();
    final scan = context.read<ScanProvider>();
    final shift = context.read<ShiftProvider>();
    final duty = context.read<DutyProvider>();
    final navigator = Navigator.of(context);
    final ok = await auth.login(_emailCtrl.text.trim(), _passCtrl.text);
    if (!mounted) return;
    if (ok) {
      await Future.wait([
        scan.loadScans(force: true),
        scan.loadCheckpoints(force: true),
        shift.loadStatus(force: true),
        duty.load(force: true),
      ]);
      if (!mounted) return;
      navigator.pushReplacementNamed(AppRoutes.home);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.card,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 520),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _LoginBrand(),
                    const SizedBox(height: 34),
                    const _LoginHero(),
                    const SizedBox(height: 30),
                    Text(
                      'Welcome back',
                      style: TextStyle(
                        color: AppTheme.text,
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.8,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Sign in to continue managing your patrol shift.',
                      style: TextStyle(
                        color: AppTheme.textSecondary,
                        fontSize: 15,
                        height: 1.45,
                      ),
                    ),
                    // The account-type chips were removed: they set a field the
                    // login call never read, so picking one changed nothing, and
                    // offering "Client" advertised an account type this app now
                    // refuses. The account's own role decides what it can do.
                    const SizedBox(height: 28),
                    const _FieldLabel(label: 'Email address'),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _emailCtrl,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppTheme.muted,
                        hintText: 'you@company.com',
                        prefixIcon: Icon(
                          Icons.mail_outline_rounded,
                          color: AppTheme.primaryDark,
                        ),
                      ),
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      validator: (v) => v?.isEmpty ?? true
                          ? 'Enter your email address'
                          : null,
                    ),
                    const SizedBox(height: 18),
                    const _FieldLabel(label: 'Password'),
                    const SizedBox(height: 8),
                    TextFormField(
                      controller: _passCtrl,
                      obscureText: _obscure,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: AppTheme.muted,
                        hintText: 'Enter your password',
                        prefixIcon: Icon(
                          Icons.lock_outline_rounded,
                          color: AppTheme.primaryDark,
                        ),
                        suffixIcon: IconButton(
                          tooltip: _obscure ? 'Show password' : 'Hide password',
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                            color: AppTheme.textSecondary,
                          ),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      textInputAction: TextInputAction.done,
                      onFieldSubmitted: (_) => _login(),
                      validator: (v) =>
                          v?.isEmpty ?? true ? 'Enter your password' : null,
                    ),
                    const SizedBox(height: 18),
                    Consumer<AuthProvider>(
                      builder: (_, auth, __) {
                        if (auth.error == null) {
                          return const SizedBox.shrink();
                        }
                        return Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 18),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.error.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: AppTheme.error.withValues(alpha: 0.18),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(
                                Icons.error_outline_rounded,
                                color: AppTheme.error,
                                size: 19,
                              ),
                              const SizedBox(width: 9),
                              Expanded(
                                child: Text(
                                  auth.error!,
                                  style: TextStyle(
                                    color: AppTheme.error,
                                    fontSize: 13,
                                    height: 1.35,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                    Consumer<AuthProvider>(
                      builder: (_, auth, __) => SizedBox(
                        width: double.infinity,
                        height: 54,
                        child: ElevatedButton(
                          onPressed: auth.loading ? null : _login,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppTheme.primaryDark,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: AppTheme.primaryDark
                                .withValues(alpha: 0.55),
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(15),
                            ),
                          ),
                          child: auth.loading
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      'Sign in',
                                      style: TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    SizedBox(width: 10),
                                    Icon(Icons.arrow_forward_rounded, size: 19),
                                  ],
                                ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Center(
                      child: Text(
                        'Your access is protected and role-based.',
                        style: TextStyle(
                          color: AppTheme.textSecondary.withValues(alpha: 0.9),
                          fontSize: 12,
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Center(
                      child: Wrap(
                        alignment: WrapAlignment.center,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 6,
                        children: [
                          Icon(
                            Icons.shield_outlined,
                            size: 15,
                            color: AppTheme.primaryDark.withValues(alpha: 0.8),
                          ),
                          Text(
                            'Guard and supervisor accounts',
                            style: TextStyle(
                              color: AppTheme.textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoginBrand extends StatelessWidget {
  const _LoginBrand();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: AppTheme.primary,
            borderRadius: BorderRadius.circular(13),
          ),
          child: Icon(
            Icons.shield_rounded,
            color: AppTheme.text,
            size: 23,
          ),
        ),
        const SizedBox(width: 11),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'PATROL COMMAND',
              style: TextStyle(
                color: AppTheme.text,
                fontSize: 13,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.6,
              ),
            ),
            SizedBox(height: 3),
            Text(
              'SECURITY OPERATIONS',
              style: TextStyle(
                color: AppTheme.textSecondary,
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _LoginHero extends StatelessWidget {
  const _LoginHero();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      height: 156,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppTheme.primarySurface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.primary.withValues(alpha: 0.2)),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -56,
            right: -28,
            child: Container(
              width: 170,
              height: 170,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.primary.withValues(alpha: 0.13),
              ),
            ),
          ),
          Positioned(
            bottom: -66,
            left: -30,
            child: Container(
              width: 150,
              height: 150,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.65),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 22),
            child: Row(
              children: [
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: AppTheme.card.withValues(alpha: 0.85),
                    shape: BoxShape.circle,
                    border: Border.all(color: AppTheme.card, width: 5),
                  ),
                  child: Icon(
                    Icons.shield_outlined,
                    color: AppTheme.primaryDark,
                    size: 48,
                  ),
                ),
                const SizedBox(width: 18),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // The hero is a fixed-height box, so both lines are
                      // capped: on a 320pt screen the copy would otherwise
                      // wrap past the bottom edge.
                      Text(
                        'Secure access',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppTheme.text,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      SizedBox(height: 7),
                      Text(
                        'Your shift starts with a clear view of what matters.',
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: AppTheme.textSecondary,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        color: AppTheme.text,
        fontSize: 13,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

