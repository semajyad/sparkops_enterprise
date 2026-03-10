# Page snapshot

```yaml
- generic [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e5]:
    - generic [ref=e6]:
      - button "TradeOps secure access" [ref=e7]:
        - generic [ref=e8]: TO
      - img [ref=e10]
      - heading "TRADEOPS SECURE ACCESS" [level=1] [ref=e13]
      - paragraph [ref=e14]: Welcome
      - paragraph [ref=e15]: Sign in or create your TradeOps account.
    - generic [ref=e16]:
      - button "Login" [ref=e17]
      - button "Sign Up" [ref=e18]
    - generic [ref=e19]:
      - generic [ref=e20]:
        - generic [ref=e21]: Email
        - textbox "Email" [ref=e22]:
          - /placeholder: you@example.com
          - text: jimmybobday@gmail.com
      - generic [ref=e23]:
        - generic [ref=e24]: Password
        - textbox "Password" [active] [ref=e25]:
          - /placeholder: ••••••••
          - text: Samdoggy1!
      - button "Sign In to TradeOps" [ref=e26]
    - generic [ref=e27]:
      - paragraph [ref=e28]: "Status: Connected"
      - generic [ref=e29]:
        - link "Back to home" [ref=e30] [cursor=pointer]:
          - /url: /
        - text: •
        - link "Create account" [ref=e31] [cursor=pointer]:
          - /url: /signup
```