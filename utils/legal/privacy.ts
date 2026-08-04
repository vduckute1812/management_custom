import type { LegalDocumentSet } from "~/types/legal";

/**
 * Privacy policy, authored in English and Vietnamese.
 *
 * Every statement here is meant to match observable behaviour of this install
 * (cookie names and TTLs, retention windows, processors, admin reach). If a
 * capability changes, this file changes with it — and `tests/legal.test.ts`
 * enforces that both languages keep the same section structure.
 */
export const privacyPolicy: LegalDocumentSet = {
  en: {
    title: "Privacy Policy",
    summary:
      "What this service records about you, who else can see it, and how long it is kept.",
    effectiveDate: "2026-08-04",
    intro: [
      "Da Nang TechX is a small, self-hosted community portal: a public feed, 24-hour stories, one-to-one chat, a private time-management workspace, and a personal Money ledger. This policy explains what the service records about you, why, who else processes it, and what you can ask for.",
      "It describes what the software actually does. Where a capability does not exist yet — the built-in export does not cover chat, for example — this policy says so plainly instead of implying otherwise.",
    ],
    sections: [
      {
        id: "controller",
        heading: "1. Who is responsible",
        paragraphs: [
          "The service is operated by Đức Nguyễn Văn (ducbkdn95@gmail.com), an individual in Vietnam, acting as the data controller. There is no company behind it and no data-protection officer: one person runs the install and answers the mail.",
          "The application runs on hardware the operator administers and is published to the internet through Cloudflare. It is not a multi-tenant commercial platform.",
        ],
      },
      {
        id: "scope",
        heading: "2. What this policy covers",
        paragraphs: [
          "This policy covers the website and API at dntechx.com — the public hub and feed, posts, comments, stories, chat, uploads, the Time Management workspace, and the Money module — whether you are signed in or only browsing.",
          "Using the service also means accepting the Terms of Service. This policy does not license the source code, which is proprietary and covered by its own terms.",
        ],
      },
      {
        id: "account-data",
        heading: "3. Account information",
        paragraphs: [
          "An email address is the only piece of personal data the service requires. When you register with a password, the database stores your email address, a bcrypt hash of the password (never the password itself), and the times your account was created, last updated, and last signed in.",
        ],
        bullets: [
          "Optional profile fields you choose to fill in: display name, avatar image, title, job, and location.",
          "Your role in the install (member, admin, or superadmin) and whether your email address has been verified.",
          "Preferred interface language and Money display currency, stored on the account so emails and Money formatting follow your choice across devices.",
          "If you sign in with Google: the Google account identifier, the email address, and the name Google returns. The Google profile photo is received but not stored.",
        ],
      },
      {
        id: "content-data",
        heading: "4. What you create",
        paragraphs: [
          "Everything you make in the app is stored in the operator's database until you delete it or the account is deleted.",
        ],
        bullets: [
          "Time Management: epics, tasks, notes, tags, due dates, checklist items, scheduled time blocks, and timer sessions. These rows are private to your account — no other member, admins included, has an endpoint that reads them.",
          "Feed: posts and their titles, bodies, categories, styling, comments, reactions, and the audience list when a post is shared with named members.",
          "Stories: the text, any attached media, reactions, and a record of which signed-in member viewed the story. Only the author can see that viewer list.",
          "Chat: message text, stickers, image and voice-note attachments, reactions, and per-conversation read state.",
          "Money: income and expense transactions, custom categories, savings goals and contributions, monthly budgets, and the display currency preference. These rows are private to your account — no other member, admins included, has an endpoint that reads them.",
          "Uploads: the file itself plus its original name, MIME type, kind, size, and storage key.",
        ],
      },
      {
        id: "cookies",
        heading: "5. Cookies",
        paragraphs: [
          "The service sets four cookies. None of them are advertising or cross-site tracking cookies, and there is no cookie consent banner because none of them are used for tracking.",
        ],
        bullets: [
          "mgmt_at — short-lived access token. HttpOnly, SameSite=Lax, expires after 15 minutes.",
          "mgmt_rt — refresh token that keeps you signed in. HttpOnly, SameSite=Lax, expires after 30 days.",
          "mgmt_oauth — single-use anti-forgery nonce during Google sign-in. HttpOnly, expires after 10 minutes.",
          "mgmt_locale — remembers your interface language. Readable by the browser and free of personal data.",
        ],
      },
      {
        id: "device-data",
        heading: "6. Device, network, and log data",
        paragraphs: [
          "Your browser keeps your display preferences (theme, density, week start, time format, language, alert settings) and a cached copy of your own profile in local storage, under the keys mgmt:settings:v1, auth:user, and auth:hasSession. Session secrets are never written to local storage.",
          "Each signed-in session row records the IP address and browser user-agent it was created from, so a session can be recognised and revoked. Abuse protection counts requests per IP address (and, on sign-in and password-reset routes, per email address) in memory or Redis; those counters expire with their short window, typically one minute.",
          "For a first-time visitor the server reads the country code Cloudflare attaches to the request (CF-IPCountry) to pick a sensible default language. The country code is used in the response and not stored. The server also keeps the last few hundred log lines in memory for the superadmin's diagnostics screen; those lines can contain an email address when a message fails to send, but never passwords, tokens, or request bodies.",
        ],
      },
      {
        id: "tracking",
        heading: "7. No advertising or product analytics",
        paragraphs: [
          "The application ships no analytics SDK, no advertising pixel, and no behavioural profiling. Nothing about your usage is sold or shared for marketing.",
          "Two edge details are worth naming. Cloudflare sits in front of the site and may add its own lightweight analytics beacon at the edge, outside the application code. Feed and manuscript pages load one webfont from Google Fonts, which means Google receives the IP address and user-agent of that font request.",
        ],
      },
      {
        id: "purposes",
        heading: "8. Why the data is used",
        paragraphs: ["Data is used only to run the service you asked for:"],
        bullets: [
          "Authenticate you, keep you signed in, and verify your email address.",
          "Store and display the content you create, according to the visibility you chose.",
          "Send transactional email: address verification and password reset.",
          "Protect the install against brute force, spam, and abuse.",
          "Pick a default interface language on your first visit.",
          "Give admins aggregate activity figures so the install can be maintained.",
        ],
      },
      {
        id: "legal-basis",
        heading: "9. Legal basis",
        paragraphs: [
          "Processing rests on performance of the agreement between you and the operator (Terms of Service) for account and content data, on the operator's legitimate interest in keeping the install secure and working for abuse-protection and diagnostic data, and on your consent where you volunteer optional profile details or opt in to alerts.",
          "The operator processes personal data in line with Vietnamese law, including Decree 13/2023/ND-CP on personal data protection. If you are in a jurisdiction with additional rights, the operator will honour requests it can technically satisfy.",
        ],
      },
      {
        id: "processors",
        heading: "10. Who else processes your data",
        paragraphs: [
          "The service depends on a short list of providers. There are no data brokers, ad networks, or resale arrangements.",
        ],
        bullets: [
          "Cloudflare — network, TLS, and the tunnel that publishes the site, plus R2 object storage for uploaded files. The storage bucket is private; files are served through the application with signed links that expire about an hour after they are issued.",
          "An SMTP email provider — delivers verification and password-reset messages, and therefore sees the recipient address and the message body.",
          "Google — only if you choose Google sign-in. The service requests the openid, email, and profile scopes and stores the identifier, email, and name it receives.",
          "Google Fonts — serves one webfont on feed and manuscript pages, as described above.",
        ],
      },
      {
        id: "who-sees-what",
        heading: "11. Who can see what inside the install",
        paragraphs: [
          "Visibility inside the service is deliberately narrow, and it is worth knowing the exact edges:",
        ],
        bullets: [
          "Public posts are readable by anyone on the internet, including search-engine crawlers, and appear in the site sitemap.",
          "Private posts are readable only by their author; shared posts only by the members named in the post's audience.",
          "Stories are visible to every signed-in member until they expire 24 hours after posting. Only the author sees who viewed a story.",
          "Chat conversations are readable only by the two participants. There is no administrative endpoint that reads anyone's messages. Chat is not end-to-end encrypted, so the operator could in principle read the database directly — treat it as private mail, not as a secure channel.",
          "Admins see an account list: email, name, role, verification state, timestamps, last sign-in, and activity counts such as tasks, epics, and hours logged. Admins do not see task contents, chat, private posts, or password hashes.",
          "The superadmin can additionally read server diagnostics and delete an account together with everything it owns.",
        ],
      },
      {
        id: "retention",
        heading: "12. How long data is kept",
        paragraphs: [
          "Content stays until you remove it or the account is deleted. Short-lived technical records expire on their own:",
        ],
        bullets: [
          "Access token 15 minutes; refresh session 30 days, and a revoked session row is purged about 30 days after revocation.",
          "Email-verification link 24 hours; password-reset link 1 hour.",
          "Queued transactional email carries the recipient address and the one-time token until it is sent; completed and failed queue rows are purged after 14 days.",
          "Stories and their view records are hard-deleted 24 hours after posting.",
          "Abuse counters expire with their window; response caches live 20 to 60 seconds; signed file links expire about an hour after being issued.",
          "Deleting your account — from Settings → Danger zone, at any time — removes the account row and cascades to your epics, tasks, time blocks, checklist items, timers, posts, comments, reactions, stories, chat messages, uploads, money records, and sessions. Queued emails addressed to you are dropped too. It takes effect immediately and is permanent: there is no recycle bin, no soft delete, and no grace period in which it can be reversed.",
        ],
      },
      {
        id: "your-choices",
        heading: "13. Your data, your requests",
        paragraphs: [
          "You can edit your profile at any time, and delete your own posts, comments, stories, tasks, epics, and chat messages from the app. Deleting a chat message is a hard delete for both participants — the message is removed from both sides immediately and cannot be recovered. Settings → Your data exports your epics and tasks as JSON, CSV, or an iCal calendar file, and the Money module exports its own ledger.",
          "You can also delete the whole account yourself, from Settings → Danger zone. It asks you to type your address and, unless the account signs in only with Google, your password; then everything listed in section 12 goes at once. Conversations go with it for the other participant too, because a thread cannot exist with one side missing — export or copy anything you want to keep first.",
          "One limit is honest to state: the built-in export does not yet cover feed posts, chat, stories, or profile data. For a full copy of your data, email ducbkdn95@gmail.com from the address on the account. Requests are answered without undue delay and within 30 days at the latest.",
          "You may also object to processing or withdraw consent. Withdrawing consent for the essentials — email address and password — means the account can no longer exist, so the request is handled as an account deletion.",
        ],
      },
      {
        id: "security",
        heading: "14. How the data is protected",
        paragraphs: [
          "The install applies the protections you would expect of a careful small deployment: passwords hashed with bcrypt, refresh tokens stored only as SHA-256 hashes, session cookies marked HttpOnly with a same-origin check on sensitive routes, signed short-lived access tokens, a content-security policy and hardened response headers (including HSTS on HTTPS), request rate limits at both the web server and the application, HTML sanitisation of user content before it is rendered, magic-byte checking of uploads, a private storage bucket, and TLS on every public request.",
          "No system is perfect, and this one is a personal install rather than a hardened enterprise platform. The Money module is intended for personal expense tracking you choose to keep here — do not store bank login credentials, payment-card numbers, health records, or other high-sensitivity secrets. If you believe you have found a vulnerability, email the operator before disclosing it publicly.",
        ],
      },
      {
        id: "children",
        heading: "15. Children",
        paragraphs: [
          "The service is not intended for anyone under 16, and accounts for children are not knowingly created. If you believe a child has registered, write to ducbkdn95@gmail.com and the account and its content will be removed.",
        ],
      },
      {
        id: "location",
        heading: "16. Where the data lives",
        paragraphs: [
          "The database and the application run on hardware in Vietnam. Uploaded files sit in Cloudflare R2, and email, network delivery, and Google sign-in are handled by the providers named above, which may process data outside Vietnam. By using the service you accept these transfers, which are limited to what running the service requires.",
        ],
      },
      {
        id: "changes",
        heading: "17. Changes to this policy",
        paragraphs: [
          "When the software changes what it collects, this policy is updated and the date at the top of the page moves. Significant changes are announced on the public hub. Continuing to use the service after a change means you accept the updated policy.",
        ],
      },
      {
        id: "contact",
        heading: "18. Contact",
        paragraphs: [
          "Questions, data requests, and complaints go to ducbkdn95@gmail.com. If you are not satisfied with the answer, you may lodge a complaint with the competent Vietnamese authority for personal data protection.",
        ],
      },
    ],
  },
  vi: {
    title: "Chính sách bảo mật",
    summary:
      "Dịch vụ ghi nhận những gì về bạn, ai khác có thể thấy, và dữ liệu được lưu bao lâu.",
    effectiveDate: "2026-08-04",
    intro: [
      "Da Nang TechX là một cổng cộng đồng nhỏ, tự vận hành: có bảng tin công khai, story 24 giờ, tin nhắn 1:1, một không gian quản lý thời gian riêng tư và sổ thu chi Money cá nhân. Chính sách này giải thích dịch vụ ghi nhận những gì về bạn, vì mục đích gì, ai khác xử lý dữ liệu, và bạn có thể yêu cầu những gì.",
      "Chính sách được viết đúng theo những gì phần mềm thực sự làm. Ở những chỗ tính năng chưa tồn tại — ví dụ chức năng xuất dữ liệu chưa bao gồm tin nhắn — chính sách nói rõ điều đó thay vì để bạn hiểu sai.",
    ],
    sections: [
      {
        id: "controller",
        heading: "1. Ai chịu trách nhiệm",
        paragraphs: [
          "Dịch vụ do Đức Nguyễn Văn (ducbkdn95@gmail.com), một cá nhân tại Việt Nam, vận hành với vai trò bên kiểm soát dữ liệu. Không có công ty đứng sau và không có bộ phận bảo vệ dữ liệu riêng: một người vận hành hệ thống và trả lời thư.",
          "Ứng dụng chạy trên thiết bị do chủ sở hữu tự quản trị và được đưa ra internet thông qua Cloudflare. Đây không phải một nền tảng thương mại nhiều khách thuê.",
        ],
      },
      {
        id: "scope",
        heading: "2. Phạm vi áp dụng",
        paragraphs: [
          "Chính sách này áp dụng cho website và API tại dntechx.com — trang chủ công khai và bảng tin, bài viết, bình luận, story, tin nhắn, tệp tải lên, không gian Quản lý thời gian và module Money — bất kể bạn đã đăng nhập hay chỉ ghé xem.",
          "Việc sử dụng dịch vụ đồng thời có nghĩa là bạn chấp nhận Điều khoản dịch vụ. Chính sách này không cấp quyền sử dụng mã nguồn; mã nguồn là tài sản độc quyền và có giấy phép riêng.",
        ],
      },
      {
        id: "account-data",
        heading: "3. Thông tin tài khoản",
        paragraphs: [
          "Địa chỉ email là dữ liệu cá nhân duy nhất mà dịch vụ bắt buộc phải có. Khi bạn đăng ký bằng mật khẩu, cơ sở dữ liệu lưu địa chỉ email, một bản băm bcrypt của mật khẩu (không bao giờ lưu mật khẩu gốc), cùng thời điểm tạo, cập nhật gần nhất và đăng nhập thành công gần nhất.",
        ],
        bullets: [
          "Các trường hồ sơ tuỳ chọn do bạn tự điền: tên hiển thị, ảnh đại diện, chức danh, công việc và địa điểm.",
          "Vai trò của bạn trong hệ thống (thành viên, quản trị viên hoặc superadmin) và trạng thái email đã xác thực hay chưa.",
          "Ngôn ngữ giao diện và đơn vị tiền tệ Money ưa thích, lưu trên tài khoản để email và định dạng số tiền theo lựa chọn của bạn trên mọi thiết bị.",
          "Nếu bạn đăng nhập bằng Google: mã định danh tài khoản Google, địa chỉ email và tên mà Google trả về. Ảnh đại diện Google được nhận nhưng không được lưu.",
        ],
      },
      {
        id: "content-data",
        heading: "4. Nội dung bạn tạo ra",
        paragraphs: [
          "Mọi thứ bạn tạo trong ứng dụng được lưu trong cơ sở dữ liệu của chủ sở hữu cho tới khi bạn xoá hoặc tài khoản bị xoá.",
        ],
        bullets: [
          "Quản lý thời gian: epic, task, ghi chú, thẻ, hạn chót, mục checklist, khối thời gian đã lên lịch và các phiên bấm giờ. Những dữ liệu này riêng tư với tài khoản của bạn — không thành viên nào khác, kể cả quản trị viên, có endpoint để đọc chúng.",
          "Bảng tin: bài viết cùng tiêu đề, nội dung, chuyên mục, định dạng trình bày, bình luận, biểu cảm, và danh sách người xem khi bài được chia sẻ với các thành viên cụ thể.",
          "Story: nội dung, tệp media kèm theo, biểu cảm, và bản ghi thành viên nào đã xem. Chỉ tác giả thấy được danh sách người xem.",
          "Tin nhắn: nội dung tin, sticker, ảnh và tin nhắn thoại, biểu cảm, cùng trạng thái đã đọc của từng cuộc trò chuyện.",
          "Money: giao dịch thu/chi, danh mục tự tạo, mục tiêu tiết kiệm và khoản đóng góp, ngân sách tháng, cùng đơn vị tiền tệ hiển thị. Các bản ghi này riêng tư với tài khoản của bạn — không thành viên nào khác, kể cả quản trị viên, có endpoint để đọc chúng.",
          "Tệp tải lên: bản thân tệp cùng tên gốc, kiểu MIME, loại tệp, kích thước và khoá lưu trữ.",
        ],
      },
      {
        id: "cookies",
        heading: "5. Cookie",
        paragraphs: [
          "Dịch vụ đặt bốn cookie. Không cookie nào dùng cho quảng cáo hay theo dõi xuyên site, và cũng vì vậy không có banner xin phép cookie.",
        ],
        bullets: [
          "mgmt_at — access token ngắn hạn. HttpOnly, SameSite=Lax, hết hạn sau 15 phút.",
          "mgmt_rt — refresh token giúp bạn duy trì đăng nhập. HttpOnly, SameSite=Lax, hết hạn sau 30 ngày.",
          "mgmt_oauth — mã chống giả mạo dùng một lần trong luồng đăng nhập Google. HttpOnly, hết hạn sau 10 phút.",
          "mgmt_locale — ghi nhớ ngôn ngữ giao diện. Trình duyệt đọc được và không chứa dữ liệu cá nhân.",
        ],
      },
      {
        id: "device-data",
        heading: "6. Dữ liệu thiết bị, mạng và log",
        paragraphs: [
          "Trình duyệt của bạn lưu các tuỳ chọn hiển thị (giao diện sáng/tối, mật độ, ngày đầu tuần, định dạng giờ, ngôn ngữ, cài đặt nhắc việc) và một bản đệm hồ sơ của chính bạn trong local storage, với các khoá mgmt:settings:v1, auth:user và auth:hasSession. Bí mật phiên đăng nhập không bao giờ được ghi vào local storage.",
          "Mỗi phiên đăng nhập lưu địa chỉ IP và user-agent của trình duyệt tại thời điểm tạo phiên, để có thể nhận diện và thu hồi phiên đó. Cơ chế chống lạm dụng đếm số yêu cầu theo địa chỉ IP (và theo địa chỉ email ở các route đăng nhập, đăng ký, đặt lại mật khẩu) trong bộ nhớ hoặc Redis; các bộ đếm này hết hạn cùng cửa sổ thời gian ngắn của chúng, thường là một phút.",
          "Với người truy cập lần đầu, máy chủ đọc mã quốc gia mà Cloudflare gắn vào yêu cầu (CF-IPCountry) để chọn ngôn ngữ mặc định hợp lý. Mã quốc gia chỉ dùng trong phản hồi và không được lưu lại. Máy chủ cũng giữ vài trăm dòng log gần nhất trong bộ nhớ cho màn hình chẩn đoán của superadmin; những dòng này có thể chứa địa chỉ email khi gửi thư thất bại, nhưng không chứa mật khẩu, token hay nội dung yêu cầu.",
        ],
      },
      {
        id: "tracking",
        heading: "7. Không quảng cáo, không phân tích hành vi",
        paragraphs: [
          "Ứng dụng không nhúng SDK phân tích, không pixel quảng cáo và không lập chân dung hành vi. Không dữ liệu sử dụng nào được bán hay chia sẻ cho mục đích marketing.",
          "Có hai chi tiết ở tầng biên nên nói rõ. Cloudflare đứng trước site và có thể tự thêm beacon phân tích nhẹ của họ ở tầng biên, nằm ngoài mã ứng dụng. Trang bảng tin và trang bản thảo tải một webfont từ Google Fonts, nghĩa là Google nhận được địa chỉ IP và user-agent của yêu cầu tải font đó.",
        ],
      },
      {
        id: "purposes",
        heading: "8. Mục đích sử dụng dữ liệu",
        paragraphs: [
          "Dữ liệu chỉ được dùng để vận hành đúng dịch vụ mà bạn yêu cầu:",
        ],
        bullets: [
          "Xác thực bạn, duy trì đăng nhập và xác thực địa chỉ email.",
          "Lưu và hiển thị nội dung bạn tạo, theo đúng mức hiển thị bạn đã chọn.",
          "Gửi email giao dịch: xác thực địa chỉ và đặt lại mật khẩu.",
          "Bảo vệ hệ thống trước dò mật khẩu, spam và hành vi lạm dụng.",
          "Chọn ngôn ngữ giao diện mặc định trong lần truy cập đầu tiên.",
          "Cung cấp cho quản trị viên số liệu hoạt động tổng hợp để duy trì hệ thống.",
        ],
      },
      {
        id: "legal-basis",
        heading: "9. Cơ sở pháp lý",
        paragraphs: [
          "Việc xử lý dữ liệu dựa trên: thực hiện thoả thuận giữa bạn và chủ sở hữu (Điều khoản dịch vụ) đối với dữ liệu tài khoản và nội dung; lợi ích hợp pháp của chủ sở hữu trong việc giữ hệ thống an toàn và hoạt động ổn định đối với dữ liệu chống lạm dụng và chẩn đoán; và sự đồng ý của bạn khi bạn tự nguyện cung cấp thông tin hồ sơ tuỳ chọn hoặc bật tính năng nhắc việc.",
          "Chủ sở hữu xử lý dữ liệu cá nhân theo pháp luật Việt Nam, bao gồm Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Nếu bạn ở nơi có thêm quyền khác, chủ sở hữu sẽ đáp ứng những yêu cầu mà hệ thống có thể thực hiện được về mặt kỹ thuật.",
        ],
      },
      {
        id: "processors",
        heading: "10. Những bên khác xử lý dữ liệu",
        paragraphs: [
          "Dịch vụ phụ thuộc vào một danh sách ngắn các nhà cung cấp. Không có bên môi giới dữ liệu, mạng quảng cáo hay hoạt động bán lại dữ liệu nào.",
        ],
        bullets: [
          "Cloudflare — hạ tầng mạng, TLS và đường hầm đưa site ra internet, cùng dịch vụ lưu trữ đối tượng R2 cho tệp tải lên. Bucket lưu trữ ở chế độ riêng tư; tệp được phục vụ qua ứng dụng bằng liên kết có chữ ký, hết hạn khoảng một giờ sau khi tạo.",
          "Một nhà cung cấp email SMTP — gửi thư xác thực và đặt lại mật khẩu, do đó thấy địa chỉ người nhận và nội dung thư.",
          "Google — chỉ khi bạn chọn đăng nhập bằng Google. Dịch vụ yêu cầu các phạm vi openid, email, profile và lưu mã định danh, email cùng tên nhận được.",
          "Google Fonts — phục vụ một webfont trên trang bảng tin và bản thảo, như đã nêu ở trên.",
        ],
      },
      {
        id: "who-sees-what",
        heading: "11. Ai thấy được gì trong hệ thống",
        paragraphs: [
          "Phạm vi hiển thị trong dịch vụ được thiết kế hẹp có chủ đích, và bạn nên biết chính xác các giới hạn:",
        ],
        bullets: [
          "Bài viết công khai ai trên internet cũng đọc được, kể cả trình thu thập của công cụ tìm kiếm, và xuất hiện trong sitemap của site.",
          "Bài viết riêng tư chỉ tác giả đọc được; bài chia sẻ chỉ những thành viên được nêu trong danh sách người xem của bài đọc được.",
          "Story hiển thị với mọi thành viên đã đăng nhập cho tới khi hết hạn 24 giờ sau khi đăng. Chỉ tác giả thấy ai đã xem story.",
          "Cuộc trò chuyện chỉ hai người tham gia đọc được. Không có endpoint quản trị nào đọc tin nhắn của người khác. Tin nhắn không được mã hoá đầu-cuối, nên về nguyên tắc chủ sở hữu có thể đọc trực tiếp từ cơ sở dữ liệu — hãy xem đây là thư riêng, không phải một kênh bảo mật.",
          "Quản trị viên thấy danh sách tài khoản: email, tên, vai trò, trạng thái xác thực, mốc thời gian, lần đăng nhập gần nhất và các số liệu hoạt động như số task, số epic, số giờ đã ghi nhận. Quản trị viên không thấy nội dung task, tin nhắn, bài viết riêng tư hay bản băm mật khẩu.",
          "Superadmin ngoài ra có thể đọc thông tin chẩn đoán máy chủ và xoá một tài khoản cùng toàn bộ dữ liệu thuộc tài khoản đó.",
        ],
      },
      {
        id: "retention",
        heading: "12. Thời gian lưu trữ",
        paragraphs: [
          "Nội dung được giữ cho tới khi bạn xoá hoặc tài khoản bị xoá. Các bản ghi kỹ thuật ngắn hạn tự hết hạn:",
        ],
        bullets: [
          "Access token 15 phút; phiên refresh 30 ngày, và bản ghi phiên đã thu hồi được dọn sau khoảng 30 ngày.",
          "Liên kết xác thực email 24 giờ; liên kết đặt lại mật khẩu 1 giờ.",
          "Email giao dịch trong hàng đợi mang địa chỉ người nhận và token dùng một lần cho tới khi gửi xong; các bản ghi hàng đợi đã hoàn tất hoặc thất bại được dọn sau 14 ngày.",
          "Story và bản ghi lượt xem bị xoá vĩnh viễn 24 giờ sau khi đăng.",
          "Bộ đếm chống lạm dụng hết hạn cùng cửa sổ thời gian; bộ đệm phản hồi tồn tại 20 đến 60 giây; liên kết tệp có chữ ký hết hạn khoảng một giờ sau khi tạo.",
          "Xoá tài khoản — trong Cài đặt → Vùng nguy hiểm, bất cứ lúc nào — sẽ xoá bản ghi tài khoản và kéo theo epic, task, khối thời gian, mục checklist, bộ đếm giờ, bài viết, bình luận, biểu cảm, story, tin nhắn, tệp tải lên, dữ liệu thu chi và các phiên đăng nhập của bạn. Các email đang xếp hàng gửi tới địa chỉ của bạn cũng bị huỷ. Việc xoá có hiệu lực ngay và là vĩnh viễn: không có thùng rác, không có xoá mềm, và không có thời gian chờ để hoàn tác.",
        ],
      },
      {
        id: "your-choices",
        heading: "13. Dữ liệu của bạn và các yêu cầu",
        paragraphs: [
          "Bạn có thể sửa hồ sơ bất cứ lúc nào, và tự xoá bài viết, bình luận, story, task, epic và tin nhắn của mình trong ứng dụng. Xoá tin nhắn là xoá vĩnh viễn cho cả hai phía — tin nhắn biến mất ngay lập tức với cả người gửi lẫn người nhận và không thể khôi phục. Cài đặt → Dữ liệu của bạn cho phép xuất epic và task ra JSON, CSV hoặc tệp lịch iCal, và module Ghi chép thu chi có chức năng xuất riêng.",
          "Bạn cũng có thể tự xoá toàn bộ tài khoản trong Cài đặt → Vùng nguy hiểm. Hệ thống yêu cầu bạn nhập đúng địa chỉ email và mật khẩu (trừ khi tài khoản chỉ đăng nhập bằng Google), sau đó mọi thứ nêu ở mục 12 sẽ mất cùng lúc. Các cuộc trò chuyện cũng mất với người còn lại, vì một luồng tin nhắn không thể tồn tại khi thiếu một bên — hãy xuất hoặc lưu lại những gì bạn muốn giữ trước khi xoá.",
          "Có một giới hạn cần nói thẳng: chức năng xuất dữ liệu sẵn có chưa bao gồm bài viết, tin nhắn, story hay dữ liệu hồ sơ. Để lấy bản sao đầy đủ dữ liệu, hãy gửi email tới ducbkdn95@gmail.com từ chính địa chỉ đã đăng ký. Yêu cầu được xử lý không chậm trễ và tối đa trong 30 ngày.",
          "Bạn cũng có quyền phản đối việc xử lý hoặc rút lại sự đồng ý. Rút lại đồng ý với những dữ liệu cốt lõi — địa chỉ email và mật khẩu — đồng nghĩa tài khoản không thể tồn tại nữa, nên yêu cầu đó sẽ được xử lý như một yêu cầu xoá tài khoản.",
        ],
      },
      {
        id: "security",
        heading: "14. Cách dữ liệu được bảo vệ",
        paragraphs: [
          "Hệ thống áp dụng các biện pháp hợp lý cho một triển khai nhỏ nhưng cẩn thận: mật khẩu băm bằng bcrypt, refresh token chỉ lưu dưới dạng băm SHA-256, cookie phiên đặt HttpOnly kèm kiểm tra cùng nguồn ở các route quan trọng, access token có chữ ký và thời hạn ngắn, chính sách bảo mật nội dung (CSP) cùng các header phản hồi được tăng cường (kể cả HSTS trên HTTPS), giới hạn tần suất yêu cầu ở cả web server và ứng dụng, làm sạch HTML của nội dung người dùng trước khi hiển thị, kiểm tra magic byte của tệp tải lên, bucket lưu trữ riêng tư, và TLS cho mọi yêu cầu công khai.",
          "Không hệ thống nào hoàn hảo, và đây là một hệ thống cá nhân chứ không phải nền tảng doanh nghiệp được kiểm định. Module Money dành cho theo dõi thu chi cá nhân mà bạn chọn lưu tại đây — xin đừng lưu mật khẩu ngân hàng, số thẻ thanh toán, hồ sơ sức khoẻ hay bí mật độ nhạy cảm cao khác. Nếu bạn cho rằng mình phát hiện lỗ hổng, hãy gửi email cho chủ sở hữu trước khi công bố.",
        ],
      },
      {
        id: "children",
        heading: "15. Trẻ em",
        paragraphs: [
          "Dịch vụ không dành cho người dưới 16 tuổi và không chủ đích tạo tài khoản cho trẻ em. Nếu bạn cho rằng một trẻ em đã đăng ký, hãy viết thư tới ducbkdn95@gmail.com; tài khoản và nội dung của tài khoản đó sẽ được xoá.",
        ],
      },
      {
        id: "location",
        heading: "16. Dữ liệu được lưu ở đâu",
        paragraphs: [
          "Cơ sở dữ liệu và ứng dụng chạy trên thiết bị tại Việt Nam. Tệp tải lên nằm trên Cloudflare R2; email, hạ tầng mạng và đăng nhập Google do các nhà cung cấp nêu trên đảm nhiệm và có thể xử lý dữ liệu ngoài Việt Nam. Khi sử dụng dịch vụ, bạn chấp nhận các luồng chuyển dữ liệu này, giới hạn trong phạm vi cần thiết để vận hành dịch vụ.",
        ],
      },
      {
        id: "changes",
        heading: "17. Thay đổi chính sách",
        paragraphs: [
          "Khi phần mềm thay đổi những gì nó thu thập, chính sách này sẽ được cập nhật và ngày ở đầu trang sẽ thay đổi theo. Những thay đổi đáng kể sẽ được thông báo trên trang chủ công khai. Tiếp tục sử dụng dịch vụ sau khi có thay đổi nghĩa là bạn chấp nhận chính sách đã cập nhật.",
        ],
      },
      {
        id: "contact",
        heading: "18. Liên hệ",
        paragraphs: [
          "Mọi câu hỏi, yêu cầu về dữ liệu và khiếu nại xin gửi tới ducbkdn95@gmail.com. Nếu chưa hài lòng với phản hồi, bạn có thể khiếu nại tới cơ quan có thẩm quyền của Việt Nam về bảo vệ dữ liệu cá nhân.",
        ],
      },
    ],
  },
};
