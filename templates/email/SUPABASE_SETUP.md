# 📧 SparkOps Email Templates - Supabase Integration Guide

## 🚀 Quick Setup

This guide shows how to integrate SparkOps email templates with Supabase Authentication.

## 📋 Template Configuration

### 1. Welcome Email
**Template Type**: `signup`
**Subject**: `Welcome to SparkOps! 🔥`

**HTML Content**: Copy from `welcome.html`

**Variables**:
```json
{
  "Data.DisplayName": "{{ user.name }}",
  "Email": "{{ user.email }}",
  "SiteURL": "{{ site_url }}"
}
```

### 2. Email Verification
**Template Type**: `signup`
**Subject**: `Verify your SparkOps email`

**HTML Content**: Copy from `email-verification.html`

**Variables**:
```json
{
  "Data.DisplayName": "{{ user.name }}",
  "Email": "{{ user.email }}",
  "ConfirmationURL": "{{ confirmation_url }}",
  "Token": "{{ confirmation_code }}",
  "SiteURL": "{{ site_url }}"
}
```

### 3. Password Reset
**Template Type**: `recovery`
**Subject**: `Reset your SparkOps password`

**HTML Content**: Copy from `password-reset.html`

**Variables**:
```json
{
  "Email": "{{ user.email }}",
  "ConfirmationURL": "{{ confirmation_url }}",
  "SiteURL": "{{ site_url }}"
}
```

### 4. Magic Link Login
**Template Type**: `magic_link`
**Subject**: `Your SparkOps login link`

**Variables**:
```json
{
  "Data.DisplayName": "{{ user.name }}",
  "Email": "{{ user.email }}",
  "ConfirmationURL": "{{ confirmation_url }}",
  "SiteURL": "{{ site_url }}"
}
```

### 5. Email Change
**Template Type**: `email_change`
**Subject**: `Confirm your new SparkOps email`

**Variables**:
```json
{
  "Data.DisplayName": "{{ user.name }}",
  "Email": "{{ new_email }}",
  "ConfirmationURL": "{{ confirmation_url }}",
  "SiteURL": "{{ site_url }}"
}
```

## 🔧 Custom Templates Setup

### Transactional Email Templates
For job completion, urgent alerts, and weekly reports, use Supabase Edge Functions:

```typescript
// edge-functions/send-job-completed.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { jobId, userEmail, clientName, totalAmount } = await req.json()
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Load template
    const template = await Deno.readTextFile('./templates/email/job-completed.html')
    
    // Replace variables
    const html = template
      .replace(/\{\{ client_name \}\}/g, clientName)
      .replace(/\{\{ job_id \}\}/g, jobId)
      .replace(/\{\{ total_amount \}\}/g, totalAmount)
      .replace(/\{\{ completion_date \}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{ invoice_url \}\}/g, `${Deno.env.get('SITE_URL')}/jobs/${jobId}/invoice`)
      .replace(/\{\{ site_url \}\}/g, Deno.env.get('SITE_URL'))

    // Send email
    const { error } = await supabaseClient.auth.admin.sendEmail({
      to: userEmail,
      subject: `Job Completed: ${clientName}`,
      html: html,
    })

    if (error) throw error

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
```

## 📊 Email Analytics Setup

### Tracking Parameters
Add UTM parameters to all links in templates:

```html
<!-- Example in welcome template -->
<a href="{{ .SiteURL }}/login?utm_source=email&utm_medium=welcome&utm_campaign=onboarding" class="cta-button">
  Get Started with SparkOps
</a>
```

### Open Tracking
Supabase automatically handles open tracking. Enable in:
1. Supabase Dashboard → Authentication → Settings
2. Enable "Track email opens"

### Click Tracking
Monitor link clicks in Supabase Dashboard → Authentication → Email Analytics.

## 🧪 Testing Templates

### Local Testing
Use tools like:
- **Mailtrap**: Email testing sandbox
- **EmailOnDeck**: Temporary email addresses
- **Litmus**: Email client compatibility testing

### Supabase Testing
```typescript
// Test email sending
const { data, error } = await supabaseClient.auth.admin.sendEmail({
  to: 'test@example.com',
  subject: 'Test Email',
  html: '<p>Test content</p>',
})
```

### Template Validation
```bash
# Validate HTML syntax
npx htmlhint templates/email/*.html

# Check responsive design
npx responsive-email-checker templates/email/*.html
```

## 📱 Mobile Optimization

All templates are optimized for mobile with:
- **Responsive layouts** using media queries
- **Touch-friendly buttons** (44px minimum)
- **Readable text** (14px minimum)
- **Single column** layouts on small screens

### Testing on Mobile
1. Use browser dev tools device simulation
2. Test on actual devices
3. Check email client apps (Gmail, Outlook, Apple Mail)

## 🔒 Security Considerations

### Rate Limiting
Supabase automatically handles rate limiting. Monitor in:
- Dashboard → Authentication → Settings
- Configure email rate limits as needed

### Content Security
- **No external scripts** in email templates
- **HTTPS only** for all links
- **Input validation** for dynamic content
- **XSS protection** in template rendering

### Privacy Compliance
- **GDPR compliant** templates
- **Unsubscribe links** in all emails
- **Privacy policy** references
- **Data protection** notices

## 🚨 Troubleshooting

### Common Issues

#### Variables Not Rendering
- Check variable syntax: `{{ .VariableName }}`
- Verify variable names match Supabase configuration
- Test with default values in templates

#### Links Not Clickable
```html
<!-- Ensure absolute URLs -->
<a href="{{ .SiteURL }}/login" style="color: #3b82f6; text-decoration: none;">
  Login to SparkOps
</a>
```

#### Mobile Layout Issues
```css
/* Add mobile-specific styles */
@media (max-width: 600px) {
  .email-container {
    width: 100% !important;
    max-width: 100% !important;
  }
}
```

### Email Client Issues

#### Outlook Rendering
```html
<!--[if mso]>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600">
<tr>
<td>
<![endif]-->
<div class="email-container">
<!-- Email content -->
</div>
<!--[if mso]>
</td>
</tr>
</table>
<![endif]-->
```

#### Gmail Image Blocking
```html
<!-- Ensure images have alt text -->
<img src="image.jpg" alt="SparkOps Logo" style="display: block; max-width: 100%; height: auto;">
```

## 📈 Performance Monitoring

### Key Metrics
Track in Supabase Dashboard:
- **Open rates** by template
- **Click-through rates**
- **Delivery rates**
- **Bounce rates**
- **Spam complaints**

### Optimization
- **A/B test** subject lines
- **Test send times** for engagement
- **Monitor deliverability** scores
- **Update templates** based on performance

## 🔄 Maintenance Schedule

### Daily
- **Monitor** email delivery rates
- **Check** for spam complaints
- **Review** bounce reports

### Weekly
- **Analyze** open and click rates
- **Test** new template variations
- **Update** content as needed

### Monthly
- **Review** template performance
- **Update** branding and links
- **Test** new email clients

### Quarterly
- **Audit** all templates
- **Update** legal requirements
- **Test** major template changes

## 📞 Support Resources

### Documentation
- **Supabase Auth**: https://supabase.com/docs/guides/auth
- **Email Templates**: https://supabase.com/docs/guides/auth/email-templates
- **Edge Functions**: https://supabase.com/docs/guides/functions

### Community
- **GitHub Discussions**: Supabase community
- **Discord**: Real-time support
- **Stack Overflow**: Technical questions

### Professional Support
- **Supabase Pro**: Priority support
- **Email testing services**: Litmus, EmailOnDeck
- **Design services**: Custom template creation

---

*📧 SparkOps Email Templates - Complete Supabase integration guide*