# 📧 SparkOps Email Templates

## Overview

This directory contains professionally designed HTML email templates for SparkOps, optimized for both AI agents and human email clients. All templates are responsive, accessible, and ready for Supabase integration.

## 🎨 Template Features

### ✅ **Professional Design**
- **Modern gradient backgrounds** with industrial theme
- **Consistent branding** with SparkOps 🔥 logo and colors
- **Responsive layouts** that work on all devices
- **High contrast** for accessibility (4.5:1 minimum)
- **Smooth animations** and hover effects

### ✅ **Technical Excellence**
- **Inline CSS** for maximum email client compatibility
- **Fallback styles** for older email clients
- **Semantic HTML** structure
- **Accessibility features** with ARIA labels
- **Optimized images** with alt text

### ✅ **Template Variables**
All templates use Supabase Go template variables:
```html
{{ .VariableName }}
```

**Available Variables**:
- `{{ .ConfirmationURL }}` - Email confirmation/reset link
- `{{ .Token }}` - Verification/reset token
- `{{ .TokenHash }}` - Hashed token for security
- `{{ .SiteURL }}` - Your application base URL
- `{{ .Email }}` - User's email address
- `{{ .Data }}` - Additional user data (e.g., `{{ .Data.DisplayName }}`)
- `{{ .RedirectTo }}` - Custom redirect URL

## 📋 Available Templates

### 1. **Welcome Email** (`welcome.html`)
**Purpose**: New user onboarding and account activation

**Key Features**:
- User information display
- Feature highlights with icons
- Quick start guide
- Call-to-action button
- Support links

**Variables**:
- `{{ .Data.DisplayName }}` - User's full name
- `{{ .Email }}` - User's email address
- `{{ .SiteURL }}` - Dashboard login link
- `{{ .SiteURL }}/docs` - Documentation link
- `{{ .SiteURL }}/privacy` - Privacy policy
- `{{ .SiteURL }}/terms` - Terms of service

---

### 2. **Email Verification** (`email-verification.html`)
**Purpose**: Email address verification for new accounts

**Key Features**:
- Security notice with expiry time
- Manual verification code fallback
- Benefits overview
- Help section

**Variables**:
- `{{ .Data.DisplayName }}` - User's full name
- `{{ .Email }}` - User's email address
- `{{ .ConfirmationURL }}` - Verification link
- `{{ .Token }}` - 6-digit verification code
- `{{ .SiteURL }}/docs/verification` - Verification guide
- `{{ .SiteURL }}/faq` - FAQ page

---

### 3. **Password Reset** (`password-reset.html`)
**Purpose**: Secure password reset functionality

**Key Features**:
- Security notice and IP tracking
- Password security tips
- Help for unauthorized requests
- Expiry warnings

**Variables**:
- `{{ .Email }}` - User's email address
- `{{ .ConfirmationURL }}` - Password reset link
- `{{ .SiteURL }}/security` - Account security page
- `{{ .SiteURL }}/docs/security` - Security documentation

---

### 4. **Job Completed** (`job-completed.html`)
**Purpose**: Job completion notification with invoice

**Key Features**:
- Job summary with pricing
- Materials and labor breakdown
- PDF invoice download
- Next steps guide

**Variables**:
- `client_name` - Client name
- `job_id` - Unique job identifier
- `total_amount` - Invoice total
- `completion_date` - Job completion date
- `invoice_url` - PDF download link
- `materials` - Array of material items
- `labor_hours` - Total labor hours
- `labor_rate` - Hourly labor rate

---

### 5. **Urgent Job Alert** (`urgent-job-alert.html`)
**Purpose**: High-priority job notifications (Ladder Mode)

**Key Features**:
- Urgent styling with red accents
- Voicemail transcript display
- AI analysis results
- Immediate action buttons
- Ladder Mode status

**Variables**:
- `client_name` - Client name
- `client_phone` - Client phone number
- `voicemail_transcript` - Voicemail content
- `urgency_level` - High/Medium/Low
- `dashboard_url` - Dashboard link
- `alert_time` - Alert timestamp

---

### 6. **Weekly Report** (`weekly-report.html`)
**Purpose**: Business performance summary

**Key Features**:
- Metrics grid with KPIs
- Performance progress bars
- Top performing jobs
- Business insights
- Dashboard link

**Variables**:
- `report_period` - Week date range
- `total_jobs` - Jobs completed
- `total_revenue` - Total revenue
- `total_hours` - Billable hours
- `material_spend` - Material costs
- `completion_rate` - Job completion percentage
- `top_jobs` - Array of top job data
- `dashboard_url` - Dashboard link

---

## 🔧 Supabase Integration

### Step 1: Upload Templates
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Select "Custom" template type
3. Copy and paste HTML content
4. Configure template variables

### Step 2: Configure Variables
Set up these variables in your Supabase email templates:

```javascript
// Example for welcome email
{
  "user_name": "{{ user.name }}",
  "user_email": "{{ user.email }}",
  "login_url": "{{ site_url }}/login",
  "docs_url": "{{ site_url }}/docs",
  "support_url": "mailto:support@sparkops.co.nz"
}
```

### Step 3: Test Templates
Use Supabase's test functionality to verify:
- Variable substitution
- Link functionality
- Mobile responsiveness
- Email client compatibility

---

## 📱 Mobile Optimization

### Responsive Breakpoints
- **Desktop**: 600px+ width
- **Tablet**: 400-600px width  
- **Mobile**: <400px width

### Mobile Features
- **Touch-friendly buttons** (44px minimum)
- **Readable text** (14px minimum)
- **Single column layouts** on small screens
- **Optimized spacing** for touch interaction

### Email Client Support
- **Gmail**: Full support
- **Outlook**: Full support with fallbacks
- **Apple Mail**: Full support
- **Mobile clients**: Optimized layouts

---

## 🎨 Customization Guide

### Brand Colors
```css
--primary: #fbbf24;      /* SparkOps yellow */
--secondary: #3b82f6;    /* Blue */
--success: #10b981;      /* Green */
--warning: #f59e0b;      /* Orange */
--danger: #dc2626;       /* Red */
--dark: #0f172a;         /* Dark blue */
--light: #f8fafc;        /* Light gray */
```

### Typography
```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
--font-size-xs: 12px;
--font-size-sm: 14px;
--font-size-base: 16px;
--font-size-lg: 18px;
--font-size-xl: 20px;
--font-size-2xl: 24px;
--font-size-3xl: 28px;
```

### Icon Usage
Templates use emoji icons for universal compatibility:
- 🎤 Voice capture
- 📸 Receipt processing  
- 📱 Mobile features
- 📞 Telecommunications
- 🔥 SparkOps branding
- 💰 Financial metrics
- 📊 Analytics

---

## 🔍 Testing Checklist

### Pre-Deployment Tests
- [ ] All variables render correctly
- [ ] Links are functional
- [ ] Images load properly
- [ ] Mobile responsiveness works
- [ ] Dark mode compatibility
- [ ] Accessibility standards met

### Email Client Testing
- [ ] Gmail (web and mobile)
- [ ] Outlook (web and desktop)
- [ ] Apple Mail (iOS and macOS)
- [ ] Android email clients
- [ ] Web-based email clients

### Variable Testing
- [ ] Empty values show defaults
- [ ] Long values wrap properly
- [ ] Special characters display
- [ ] URLs encode correctly
- [ ] Dates format properly

---

## 🚀 Best Practices

### Subject Lines
Keep subject lines under 50 characters for mobile:
```
Welcome to SparkOps! 🎉
Verify your SparkOps email
Reset your SparkOps password
Job Completed: {{ client_name }}
🚨 Urgent Job Alert - {{ client_name }}
Your Weekly SparkOps Report
```

### Preview Text
Add compelling preview text (35-75 characters):
```
Transform voice notes into professional invoices
Your account is ready - verify your email
Secure link to reset your password
Job completed successfully - invoice attached
High priority job requires immediate attention
Your business performance summary this week
```

### Sending Guidelines
- **Timing**: Send at optimal times for your audience
- **Frequency**: Respect user preferences
- **Personalization**: Use all available variables
- **Testing**: A/B test subject lines when possible
- **Analytics**: Track open rates and click-through rates

---

## 🆘 Troubleshooting

### Common Issues

#### Variables Not Rendering
- Check variable syntax: `{{ variable_name }}`
- Verify variable names match Supabase configuration
- Test with default values: `{{ variable || "default" }}`

#### Mobile Layout Issues
- Test on actual devices, not just simulators
- Check for CSS inlining
- Verify media queries are supported

#### Links Not Working
- Ensure URLs are absolute: `https://domain.com/path`
- Check for tracking parameters
- Test link shorteners if used

#### Images Not Loading
- Use absolute image URLs
- Check file size limits (typically 25MB)
- Ensure alt text is provided

### Email Client Specific Fixes

#### Outlook Issues
```css
/* Outlook-specific CSS */
.outlook-only {
    mso-line-height-rule: exactly;
    line-height: 0;
}
```

#### Gmail Issues
```css
/* Gmail-specific CSS */
.gmail-only {
    display: block !important;
}
```

---

## 📈 Analytics and Tracking

### Click Tracking
Add UTM parameters to all links:
```html
<a href="https://app.sparkops.co.nz/dashboard?utm_source=email&utm_medium=weekly_report&utm_campaign=performance">
```

### Open Tracking
Use Supabase's built-in open tracking or add:
```html
<img src="https://your-domain.com/track-open?email={{ user_email }}" width="1" height="1" style="display:none;">
```

### Conversion Tracking
Monitor key metrics:
- Open rates by template
- Click-through rates
- Conversion to dashboard visits
- Time to first action

---

## 🔄 Maintenance

### Regular Updates
- **Quarterly**: Review template performance
- **Monthly**: Update content and links
- **Weekly**: Monitor deliverability rates
- **As needed**: Fix rendering issues

### Version Control
Keep templates in version control:
```bash
git add templates/email/
git commit -m "Update welcome email template"
```

### Backup Strategy
- **Local copies**: Keep HTML files in repository
- **Cloud backup**: Store in shared drive
- **Supabase backup**: Export template configurations

---

## 📞 Support

### Template Issues
- **Documentation**: Review this guide thoroughly
- **Testing**: Use email testing tools
- **Community**: Check Supabase community forums
- **Support**: Contact development team

### Custom Development
For custom template needs:
1. Review existing templates for patterns
2. Follow design guidelines
3. Test thoroughly across clients
4. Document new variables

---

*📧 SparkOps Email Templates - Professional communication for voice-to-cash platform*