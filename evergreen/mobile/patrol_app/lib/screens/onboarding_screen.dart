import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../utils/routes.dart';
import '../utils/theme.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, this.hasActiveSession = false});

  final bool hasActiveSession;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  static const _storage = FlutterSecureStorage();
  static const onboardingCompleteKey = 'patrol_onboarding_complete';

  final _pageController = PageController();
  int _currentPage = 0;
  bool _finishing = false;

  static const _pages = [
    _OnboardingPageData(
      eyebrow: 'WELCOME TO PATROL COMMAND',
      title: 'A clearer way to protect every site.',
      description:
          'Everything your team needs to stay visible, accountable, and ready during every shift.',
      icon: Icons.shield_rounded,
      accent: Color(0xFF8DF5B7),
    ),
    _OnboardingPageData(
      eyebrow: 'PATROLS, MADE SIMPLE',
      title: 'Stay on route. Never miss a checkpoint.',
      description:
          'Scan checkpoint QR codes, confirm your location, and keep your patrol moving with confidence.',
      icon: Icons.route_rounded,
      accent: Color(0xFF8DD8FF),
    ),
    _OnboardingPageData(
      eyebrow: 'CAPTURE WHAT MATTERS',
      title: 'Turn every observation into a record.',
      description:
          'Log incidents, handovers, visitor checks, and site activity while the details are still fresh.',
      icon: Icons.fact_check_rounded,
      accent: Color(0xFFFFD38D),
    ),
    _OnboardingPageData(
      eyebrow: 'ONE TEAM, ONE VIEW',
      title: 'Keep everyone in the loop.',
      description:
          'Your duty information, recent activity, and important updates are always close at hand.',
      icon: Icons.groups_rounded,
      accent: Color(0xFFD5B5FF),
    ),
    _OnboardingPageData(
      eyebrow: 'READY WHEN YOU ARE',
      title: 'Make every shift count.',
      description:
          'Sign in to your account and get the right tools for your role, right when you need them.',
      icon: Icons.arrow_forward_rounded,
      accent: Color(0xFF8DF5B7),
    ),
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _next() async {
    if (_currentPage < _pages.length - 1) {
      await _pageController.nextPage(
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
      return;
    }

    setState(() => _finishing = true);
    try {
      await _storage.write(key: onboardingCompleteKey, value: 'true');
      if (!mounted) return;
      Navigator.pushReplacementNamed(
        context,
        widget.hasActiveSession ? AppRoutes.home : AppRoutes.login,
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _finishing = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('We could not save your setup. Please try again.'),
        ),
      );
    }
  }

  Future<void> _previous() async {
    if (_currentPage == 0) return;
    await _pageController.previousPage(
      duration: const Duration(milliseconds: 360),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final page = _pages[_currentPage];
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.onboardingBackground,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
              child: Row(
                children: [
                  const _BrandMark(),
                  const SizedBox(width: 10),
                  Flexible(
                    child: Text(
                      'PATROL COMMAND',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: AppTheme.onboardingInk,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.7,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${(_currentPage + 1).toString().padLeft(2, '0')} / ${_pages.length.toString().padLeft(2, '0')}',
                    style: TextStyle(
                      color: AppTheme.onboardingMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.1,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Row(
                children: List.generate(
                  _pages.length,
                  (index) => Expanded(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 240),
                      height: 4,
                      margin: EdgeInsets.only(
                        right: index == _pages.length - 1 ? 0 : 6,
                      ),
                      decoration: BoxDecoration(
                        color: index <= _currentPage
                            ? AppTheme.primary
                            : AppTheme.onboardingTrack,
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: _pages.length,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemBuilder: (context, index) =>
                    _OnboardingPage(data: _pages[index], pageIndex: index),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 22),
              child: Row(
                children: [
                  SizedBox(
                    width: 52,
                    height: 52,
                    child: OutlinedButton(
                      onPressed: _currentPage == 0 || _finishing
                          ? null
                          : _previous,
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: BorderSide(
                          color: AppTheme.onboardingBorder,
                        ),
                        foregroundColor: AppTheme.onboardingInk,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(17),
                        ),
                      ),
                      child: const Icon(Icons.arrow_back_rounded, size: 20),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: _finishing ? null : _next,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppTheme.onboardingInk,
                          foregroundColor: Colors.white,
                          disabledBackgroundColor: AppTheme.onboardingInk
                              .withValues(alpha: 0.55),
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(17),
                          ),
                        ),
                        child: _finishing
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    _currentPage == _pages.length - 1
                                        ? 'Continue to sign in'
                                        : 'Continue',
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Icon(page.icon, size: 18),
                                ],
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Text(
              'Secure patrol operations, made clearer.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppTheme.onboardingMuted,
                fontSize: 11,
                letterSpacing: 0.2,
              ),
            ),
            const SizedBox(height: 14),
          ],
        ),
      ),
    );
  }
}

class _OnboardingPage extends StatelessWidget {
  const _OnboardingPage({required this.data, required this.pageIndex});

  final _OnboardingPageData data;
  final int pageIndex;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _FeatureArtwork(data: data, pageIndex: pageIndex),
          const SizedBox(height: 30),
          Text(
            data.eyebrow,
            style: TextStyle(
              color: AppTheme.primaryDark,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            data.title,
            style: TextStyle(
              color: AppTheme.onboardingInk,
              fontSize: 32,
              height: 1.08,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.1,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            data.description,
            style: TextStyle(
              color: AppTheme.onboardingMuted,
              fontSize: 15,
              height: 1.55,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _FeatureArtwork extends StatelessWidget {
  const _FeatureArtwork({required this.data, required this.pageIndex});

  final _OnboardingPageData data;
  final int pageIndex;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 290,
      width: double.infinity,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppTheme.onboardingInk,
        borderRadius: BorderRadius.circular(30),
        boxShadow: [
          BoxShadow(
            color: AppTheme.onboardingInk.withValues(alpha: 0.12),
            blurRadius: 24,
            offset: const Offset(0, 14),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            top: -100,
            right: -42,
            child: _GlowCircle(
              size: 260,
              color: data.accent.withValues(alpha: 0.17),
            ),
          ),
          Positioned(
            bottom: -112,
            left: -74,
            child: _GlowCircle(
              size: 250,
              color: AppTheme.primary.withValues(alpha: 0.12),
            ),
          ),
          Positioned(
            top: 22,
            left: 24,
            child: Text(
              'FIELD OPERATIONS / 2026',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.48),
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 1.3,
              ),
            ),
          ),
          Center(
            child: _ArtworkScene(data: data, pageIndex: pageIndex),
          ),
        ],
      ),
    );
  }
}

class _ArtworkScene extends StatelessWidget {
  const _ArtworkScene({required this.data, required this.pageIndex});

  final _OnboardingPageData data;
  final int pageIndex;

  @override
  Widget build(BuildContext context) {
    switch (pageIndex) {
      case 1:
        return _RouteScene(data: data);
      case 2:
        return _RecordScene(data: data);
      case 3:
        return _TeamScene(data: data);
      case 4:
        return _ReadyScene(data: data);
      default:
        return _WelcomeScene(data: data);
    }
  }
}

class _WelcomeScene extends StatelessWidget {
  const _WelcomeScene({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Positioned(
          left: 10,
          child: _FloatingLabel(
            icon: Icons.visibility_outlined,
            text: 'VISIBLE',
            accent: data.accent,
          ),
        ),
        Positioned(
          right: 0,
          top: 5,
          child: _FloatingLabel(
            icon: Icons.verified_user_outlined,
            text: 'READY',
            accent: data.accent,
          ),
        ),
        Container(
          width: 148,
          height: 148,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: data.accent.withValues(alpha: 0.12),
            border: Border.all(color: data.accent.withValues(alpha: 0.22)),
          ),
          child: Center(
            child: Container(
              width: 104,
              height: 104,
              decoration: BoxDecoration(
                color: data.accent,
                borderRadius: BorderRadius.circular(35),
                boxShadow: [
                  BoxShadow(
                    color: data.accent.withValues(alpha: 0.22),
                    blurRadius: 28,
                  ),
                ],
              ),
              child: Icon(
                Icons.shield_rounded,
                color: AppTheme.onboardingInk,
                size: 57,
              ),
            ),
          ),
        ),
        Positioned(
          bottom: 2,
          child: _MiniStatusCard(
            icon: Icons.check_circle_rounded,
            label: 'PATROL SYSTEM ACTIVE',
            accent: data.accent,
          ),
        ),
      ],
    );
  }
}

class _RouteScene extends StatelessWidget {
  const _RouteScene({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 270,
      height: 190,
      child: Stack(
        children: [
          Positioned(
            left: 18,
            top: 24,
            child: Container(
              width: 232,
              height: 145,
              padding: const EdgeInsets.all(17),
              decoration: BoxDecoration(
                color: const Color(0xFF203B43),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.map_outlined, size: 15, color: data.accent),
                      const SizedBox(width: 7),
                      Text(
                        'TODAY\'S ROUTE',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.72),
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.1,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 15),
                  Row(
                    children: [
                      _RouteDot(color: data.accent, active: true),
                      Expanded(child: Container(height: 2, color: data.accent)),
                      _RouteDot(color: data.accent, active: true),
                      Expanded(
                        child: Container(
                          height: 2,
                          color: Colors.white.withValues(alpha: 0.2),
                        ),
                      ),
                      _RouteDot(color: Colors.white54, active: false),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        '2 of 5 checkpoints',
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.62),
                          fontSize: 11,
                        ),
                      ),
                      Text(
                        '40%',
                        style: TextStyle(
                          color: data.accent,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            child: _FloatingLabel(
              icon: Icons.location_on_rounded,
              text: 'GPS VERIFIED',
              accent: data.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _RecordScene extends StatelessWidget {
  const _RecordScene({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 270,
      height: 200,
      child: Stack(
        children: [
          Positioned(
            left: 25,
            top: 18,
            child: Transform.rotate(
              angle: -0.08,
              child: Container(
                width: 218,
                height: 155,
                padding: const EdgeInsets.all(19),
                decoration: BoxDecoration(
                  color: const Color(0xFFF9F4E9),
                  borderRadius: BorderRadius.circular(18),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.16),
                      blurRadius: 20,
                      offset: const Offset(0, 12),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(7),
                          decoration: BoxDecoration(
                            color: data.accent,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(
                            Icons.priority_high_rounded,
                            size: 17,
                            color: AppTheme.onboardingInk,
                          ),
                        ),
                        const SizedBox(width: 9),
                        Text(
                          'INCIDENT LOG',
                          style: TextStyle(
                            color: AppTheme.onboardingInk,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.1,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _PaperLine(width: 152),
                    const SizedBox(height: 9),
                    _PaperLine(width: 182),
                    const SizedBox(height: 9),
                    _PaperLine(width: 124),
                    const Spacer(),
                    Row(
                      children: [
                        Icon(
                          Icons.attach_file_rounded,
                          size: 14,
                          color: AppTheme.primaryDark,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'Details saved',
                          style: TextStyle(
                            color: AppTheme.onboardingMuted,
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            right: 1,
            bottom: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.onboardingInk, width: 4),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.photo_camera_outlined,
                    color: Colors.white,
                    size: 16,
                  ),
                  SizedBox(width: 6),
                  Text(
                    'ADD PROOF',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.7,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TeamScene extends StatelessWidget {
  const _TeamScene({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 282,
      height: 195,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 0,
            top: 32,
            child: _PersonTile(
              icon: Icons.person_outline_rounded,
              label: 'GUARD',
              color: data.accent,
            ),
          ),
          Positioned(
            right: 0,
            top: 17,
            child: _PersonTile(
              icon: Icons.manage_accounts_outlined,
              label: 'SUPERVISOR',
              color: const Color(0xFF8DD8FF),
            ),
          ),
          Container(
            width: 102,
            height: 102,
            decoration: BoxDecoration(
              color: const Color(0xFF203B43),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
            ),
            child: Icon(data.icon, size: 47, color: data.accent),
          ),
          Positioned(
            bottom: 5,
            child: _MiniStatusCard(
              icon: Icons.notifications_active_outlined,
              label: 'UPDATES SHARED',
              accent: data.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _ReadyScene extends StatelessWidget {
  const _ReadyScene({required this.data});

  final _OnboardingPageData data;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 274,
      height: 198,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 184,
            height: 184,
            decoration: BoxDecoration(
              border: Border.all(color: data.accent.withValues(alpha: 0.2)),
              shape: BoxShape.circle,
            ),
          ),
          Container(
            width: 136,
            height: 136,
            decoration: BoxDecoration(
              color: data.accent,
              borderRadius: BorderRadius.circular(42),
              boxShadow: [
                BoxShadow(
                  color: data.accent.withValues(alpha: 0.25),
                  blurRadius: 32,
                ),
              ],
            ),
            child: Icon(
              Icons.login_rounded,
              color: AppTheme.onboardingInk,
              size: 54,
            ),
          ),
          Positioned(
            left: 0,
            top: 21,
            child: _FloatingLabel(
              icon: Icons.lock_outline_rounded,
              text: 'SECURE',
              accent: data.accent,
            ),
          ),
          Positioned(
            right: 0,
            bottom: 12,
            child: _FloatingLabel(
              icon: Icons.bolt_rounded,
              text: 'READY',
              accent: data.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _PersonTile extends StatelessWidget {
  const _PersonTile({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF203B43),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(height: 5),
          Text(
            label,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.64),
              fontSize: 8,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
        ],
      ),
    );
  }
}

class _FloatingLabel extends StatelessWidget {
  const _FloatingLabel({
    required this.icon,
    required this.text,
    required this.accent,
  });

  final IconData icon;
  final String text;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: accent, size: 15),
          const SizedBox(width: 6),
          Text(
            text,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniStatusCard extends StatelessWidget {
  const _MiniStatusCard({
    required this.icon,
    required this.label,
    required this.accent,
  });

  final IconData icon;
  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: accent, size: 15),
          const SizedBox(width: 7),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 9,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
        ],
      ),
    );
  }
}

class _RouteDot extends StatelessWidget {
  const _RouteDot({required this.color, required this.active});

  final Color color;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: active ? 13 : 10,
      height: active ? 13 : 10,
      decoration: BoxDecoration(
        color: active ? color : Colors.transparent,
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2),
      ),
    );
  }
}

class _PaperLine extends StatelessWidget {
  const _PaperLine({required this.width});

  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: 7,
      decoration: BoxDecoration(
        color: AppTheme.onboardingInk.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
      ),
    );
  }
}

class _GlowCircle extends StatelessWidget {
  const _GlowCircle({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }
}

class _BrandMark extends StatelessWidget {
  const _BrandMark();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: AppTheme.primary,
        borderRadius: BorderRadius.circular(9),
      ),
      child: Icon(
        Icons.shield_rounded,
        color: AppTheme.onboardingInk,
        size: 17,
      ),
    );
  }
}

class _OnboardingPageData {
  const _OnboardingPageData({
    required this.eyebrow,
    required this.title,
    required this.description,
    required this.icon,
    required this.accent,
  });

  final String eyebrow;
  final String title;
  final String description;
  final IconData icon;
  final Color accent;
}
