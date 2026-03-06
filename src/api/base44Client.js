import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});
```
- לחץ **Commit changes**

---

**שלב 2 — צור את 6 קבצי entities מחדש:**

כנס לכתובת:
```
https://github.com/ShmuelBarazani/Hamishak/new/main/src/entities
