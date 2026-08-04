import type { LegalDocumentSet } from "~/types/legal";

/**
 * Terms of service, authored in English and Vietnamese.
 *
 * These terms describe the install as it behaves today — free, best-effort, run
 * by one person on self-administered hardware — and deliberately avoid
 * promising availability or support the operator cannot deliver.
 */
export const termsOfService: LegalDocumentSet = {
  en: {
    title: "Terms of Service",
    summary:
      "The rules for using Da Nang TechX: what you may do, what you keep, and what is not guaranteed.",
    effectiveDate: "2026-08-03",
    intro: [
      "Da Nang TechX is a community portal at dntechx.com with a public feed, 24-hour stories, one-to-one chat, and a private time-management workspace. It is free to use and run by one person.",
      "These terms are the agreement between you and the operator. They apply whether you browse the public pages or hold an account, and they are written to be read — plain sentences, no hidden clauses.",
    ],
    sections: [
      {
        id: "agreement",
        heading: "1. Agreement",
        paragraphs: [
          "The service is operated by Đức Nguyễn Văn (ducbkdn95@gmail.com), an individual in Vietnam. By opening the site, creating an account, or posting anything, you accept these terms and the Privacy Policy.",
          "If you do not accept them, do not use the service.",
        ],
      },
      {
        id: "eligibility",
        heading: "2. Who may use it",
        paragraphs: [
          "You must be at least 16 years old to create an account. Register with an email address you control, keep your details accurate, and keep your password to yourself — you are responsible for everything done through your account.",
          "One person, one account. Do not register on behalf of someone else, impersonate another member, or share your credentials.",
        ],
      },
      {
        id: "account",
        heading: "3. Your account",
        paragraphs: [
          "Accounts created with a password must verify their email address before signing in. Accounts created through Google sign-in rely on the email address Google has already verified.",
          "Tell the operator promptly if you think someone else has access to your account. Signing out everywhere revokes your active sessions, and the operator may suspend an account that is being used in breach of these terms.",
        ],
      },
      {
        id: "service-nature",
        heading: "4. What the service is — and is not",
        paragraphs: [
          "This is a personal and community project running on modest, self-administered hardware. It is provided free of charge, on a best-effort basis, with no service-level agreement, no uptime promise, and no guaranteed support response.",
          "Features may change, move, or be withdrawn, and the install may be paused or shut down. The operator will try to give notice when a change is destructive, but you should keep your own copies of anything you cannot afford to lose. Settings → Your data exports your epics and tasks whenever you want.",
        ],
      },
      {
        id: "your-content",
        heading: "5. Your content stays yours",
        paragraphs: [
          "You keep ownership of everything you write and upload. Nothing here transfers copyright in your posts, messages, tasks, or files to the operator.",
          "You grant the operator a non-exclusive, worldwide, royalty-free licence to store, copy, back up, transmit, and display your content strictly as needed to run the service and to show it to the audience you selected. The licence lasts as long as the content is on the service and ends when you delete it, apart from copies in ordinary backups that age out.",
          "By posting, you confirm you have the rights to what you publish, including any images, documents, audio, or quoted material.",
        ],
      },
      {
        id: "visibility",
        heading: "6. Visibility is your choice — understand it",
        paragraphs: [
          "Each post carries a visibility setting, and it is worth being precise about what each one means before you publish.",
        ],
        bullets: [
          "Public posts can be read by anyone on the internet, indexed by search engines, and listed in the site sitemap. Treat publishing as permanent even after deletion — third parties may already have copied or cached it.",
          "Private posts are visible only to you; shared posts only to the members you name.",
          "Stories are visible to every signed-in member for 24 hours and then deleted.",
          "Chat is between two members and no administrator can read it through the application, but it is not end-to-end encrypted. Do not send passwords, financial details, or other sensitive data through it.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "7. Acceptable use",
        paragraphs: [
          "Use the service for its purpose: sharing technical work, organising your own time, and talking to other members. The following are not allowed:",
        ],
        bullets: [
          "Anything unlawful under Vietnamese law, or content that infringes someone else's copyright, trademark, privacy, or other rights.",
          "Harassment, threats, hate speech, sexual content involving minors, or publishing another person's private information.",
          "Spam, unsolicited advertising, deceptive links, malware, or phishing.",
          "Automated scraping, bulk collection, or systematic copying of other members' content, and using that content to train machine-learning or AI systems.",
          "Circumventing rate limits, access controls, or the visibility settings other members chose; probing, load-testing, or attacking the install without written permission.",
          "Reverse engineering, copying, or redistributing the software itself — see the section on the source code below.",
          "Impersonating the operator, an administrator, or another member.",
        ],
      },
      {
        id: "uploads",
        heading: "8. Files you upload",
        paragraphs: [
          "Uploads are checked by type, size, and file signature. The current limits are images up to 3 MB (GIF up to 8 MB), PDF and DOCX up to 10 MB, plain text and Markdown up to 512 KB, audio up to 5 MB, and at most 10 attachments per post.",
          "Files that break these limits or the acceptable-use rules may be removed without notice. Object storage here is not a backup service — keep your originals.",
        ],
      },
      {
        id: "moderation",
        heading: "9. Moderation and enforcement",
        paragraphs: [
          "If content or behaviour breaks these terms, the operator may remove the content, restrict a feature, suspend the account, or delete the account together with everything it owns. Where it is practical and lawful, notice and a chance to explain come first; where the risk is immediate, action comes first.",
          "Administrators can see the member list, roles, and activity totals; the superadmin can additionally read server diagnostics and delete accounts. Report abuse to ducbkdn95@gmail.com with enough detail to find the content.",
        ],
      },
      {
        id: "code-license",
        heading: "10. The software is proprietary",
        paragraphs: [
          "These terms let you use the hosted service. They grant you no rights whatsoever in the underlying source code, design, or database schema, which are proprietary with all rights reserved. Copying, running your own instance, modifying, redistributing, or using the code as AI training data requires prior written permission from the owner.",
          "The site name, wording, and visual identity belong to the operator. Your own content is excluded from this section — it stays yours, as stated above.",
        ],
      },
      {
        id: "privacy",
        heading: "11. Privacy",
        paragraphs: [
          "The Privacy Policy explains what the service records, who processes it, how long it is kept, and how to request an export or deletion. It forms part of these terms.",
        ],
      },
      {
        id: "termination",
        heading: "12. Ending the agreement",
        paragraphs: [
          "You may stop using the service at any time and delete your own posts, stories, comments, tasks, and epics from the app. You can also delete the entire account from Settings → Danger zone: it asks you to type your address and, unless you sign in only with Google, your password, and then removes the account with everything it owns.",
          "The operator may end your access for a breach of these terms, or if the install itself is retired. Deleting an account is permanent and cascades to your content, files, and sessions; there is no recycle bin. The sections on your content licence, the proprietary software, disclaimers, liability, and governing law survive termination.",
        ],
      },
      {
        id: "disclaimer",
        heading: "13. No warranty",
        paragraphs: [
          "The service is provided as is and as available, without warranties of any kind, whether express or implied, including fitness for a particular purpose, uninterrupted availability, or that content will never be lost. You use it at your own risk.",
          "Content posted by members is theirs, not the operator's, and is not endorsed or verified.",
        ],
      },
      {
        id: "liability",
        heading: "14. Limitation of liability",
        paragraphs: [
          "To the maximum extent permitted by applicable law, the operator is not liable for indirect, incidental, or consequential loss, for lost profits or opportunities, or for loss or corruption of data arising from your use of the service.",
          "Because the service is free, the operator's total liability for any claim is limited to the amount you have paid for it, which is zero, except where Vietnamese law does not allow such a limitation.",
        ],
      },
      {
        id: "changes",
        heading: "15. Changes to these terms",
        paragraphs: [
          "These terms may be updated as the service changes. The date at the top of the page shows the current version, and significant changes are announced on the public hub. Continuing to use the service after a change means you accept the new terms; if you do not, stop using the service and delete your account.",
        ],
      },
      {
        id: "governing-law",
        heading: "16. Governing law and language",
        paragraphs: [
          "These terms are governed by the laws of the Socialist Republic of Vietnam, and the competent Vietnamese courts have exclusive jurisdiction over any dispute.",
          "These terms are published in English and Vietnamese. The two texts are meant to say the same thing; if they differ, the Vietnamese text prevails. If any provision proves unenforceable, the rest stays in force.",
        ],
      },
      {
        id: "contact",
        heading: "17. Contact",
        paragraphs: [
          "Questions about these terms, abuse reports, permission requests, and account deletion requests all go to ducbkdn95@gmail.com.",
        ],
      },
    ],
  },
  vi: {
    title: "Điều khoản dịch vụ",
    summary:
      "Quy tắc sử dụng Da Nang TechX: bạn được làm gì, bạn giữ lại gì, và điều gì không được bảo đảm.",
    effectiveDate: "2026-08-03",
    intro: [
      "Da Nang TechX là cổng cộng đồng tại dntechx.com với bảng tin công khai, story 24 giờ, tin nhắn 1:1 và một không gian quản lý thời gian riêng tư. Dịch vụ miễn phí và do một người vận hành.",
      "Các điều khoản này là thoả thuận giữa bạn và chủ sở hữu. Chúng áp dụng cho cả việc bạn chỉ xem trang công khai hay có tài khoản, và được viết để đọc được — câu chữ rõ ràng, không điều khoản ẩn.",
    ],
    sections: [
      {
        id: "agreement",
        heading: "1. Thoả thuận",
        paragraphs: [
          "Dịch vụ do Đức Nguyễn Văn (ducbkdn95@gmail.com), một cá nhân tại Việt Nam, vận hành. Khi mở site, tạo tài khoản hoặc đăng bất cứ nội dung nào, bạn chấp nhận các điều khoản này và Chính sách bảo mật.",
          "Nếu bạn không chấp nhận, xin đừng sử dụng dịch vụ.",
        ],
      },
      {
        id: "eligibility",
        heading: "2. Ai được sử dụng",
        paragraphs: [
          "Bạn phải từ 16 tuổi trở lên để tạo tài khoản. Hãy đăng ký bằng địa chỉ email do bạn kiểm soát, giữ thông tin chính xác và không tiết lộ mật khẩu — bạn chịu trách nhiệm cho mọi hành vi thực hiện qua tài khoản của mình.",
          "Một người, một tài khoản. Không đăng ký thay người khác, không mạo danh thành viên khác và không chia sẻ thông tin đăng nhập.",
        ],
      },
      {
        id: "account",
        heading: "3. Tài khoản của bạn",
        paragraphs: [
          "Tài khoản tạo bằng mật khẩu phải xác thực địa chỉ email trước khi đăng nhập. Tài khoản tạo qua đăng nhập Google dựa trên địa chỉ email mà Google đã xác thực.",
          "Hãy thông báo ngay cho chủ sở hữu nếu bạn cho rằng có người khác truy cập được tài khoản của mình. Chức năng đăng xuất khỏi mọi thiết bị sẽ thu hồi các phiên đang hoạt động, và chủ sở hữu có thể tạm ngưng tài khoản đang được dùng để vi phạm các điều khoản này.",
        ],
      },
      {
        id: "service-nature",
        heading: "4. Dịch vụ này là gì — và không là gì",
        paragraphs: [
          "Đây là một dự án cá nhân và cộng đồng, chạy trên thiết bị tự quản trị với cấu hình khiêm tốn. Dịch vụ được cung cấp miễn phí, theo nguyên tắc nỗ lực tối đa, không có cam kết mức dịch vụ, không cam kết thời gian hoạt động và không cam kết thời hạn phản hồi hỗ trợ.",
          "Tính năng có thể thay đổi, di chuyển hoặc bị bỏ đi, và hệ thống có thể tạm dừng hoặc đóng lại. Chủ sở hữu sẽ cố gắng thông báo trước khi có thay đổi gây mất dữ liệu, nhưng bạn nên tự giữ bản sao những gì bạn không thể để mất. Cài đặt → Dữ liệu của bạn cho phép xuất epic và task bất cứ lúc nào.",
        ],
      },
      {
        id: "your-content",
        heading: "5. Nội dung của bạn vẫn thuộc về bạn",
        paragraphs: [
          "Bạn giữ quyền sở hữu với mọi thứ bạn viết và tải lên. Không nội dung nào trong điều khoản này chuyển quyền tác giả đối với bài viết, tin nhắn, task hay tệp của bạn sang cho chủ sở hữu.",
          "Bạn cấp cho chủ sở hữu một giấy phép không độc quyền, trên toàn thế giới, miễn phí bản quyền, để lưu trữ, sao chép, sao lưu, truyền đưa và hiển thị nội dung của bạn, chỉ trong phạm vi cần thiết để vận hành dịch vụ và hiển thị nội dung cho đúng nhóm người xem bạn đã chọn. Giấy phép tồn tại trong thời gian nội dung còn trên dịch vụ và kết thúc khi bạn xoá nội dung, trừ các bản sao trong sao lưu thông thường sẽ tự hết vòng đời.",
          "Khi đăng nội dung, bạn xác nhận mình có quyền đối với những gì mình công bố, bao gồm hình ảnh, tài liệu, âm thanh hoặc phần trích dẫn.",
        ],
      },
      {
        id: "visibility",
        heading: "6. Mức hiển thị do bạn chọn — hãy hiểu rõ",
        paragraphs: [
          "Mỗi bài viết có một thiết lập hiển thị, và bạn nên nắm chính xác ý nghĩa của từng mức trước khi đăng.",
        ],
        bullets: [
          "Bài công khai ai trên internet cũng đọc được, có thể được công cụ tìm kiếm lập chỉ mục và xuất hiện trong sitemap của site. Hãy coi việc công bố là vĩnh viễn ngay cả sau khi xoá — bên thứ ba có thể đã sao chép hoặc lưu bộ đệm.",
          "Bài riêng tư chỉ bạn thấy; bài chia sẻ chỉ những thành viên bạn nêu tên thấy được.",
          "Story hiển thị với mọi thành viên đã đăng nhập trong 24 giờ rồi bị xoá.",
          "Tin nhắn chỉ giữa hai thành viên và không quản trị viên nào đọc được qua ứng dụng, nhưng tin nhắn không được mã hoá đầu-cuối. Đừng gửi mật khẩu, thông tin tài chính hay dữ liệu nhạy cảm khác qua đó.",
        ],
      },
      {
        id: "acceptable-use",
        heading: "7. Sử dụng hợp lệ",
        paragraphs: [
          "Hãy dùng dịch vụ đúng mục đích: chia sẻ công việc kỹ thuật, tổ chức thời gian của chính bạn và trao đổi với thành viên khác. Những hành vi sau không được phép:",
        ],
        bullets: [
          "Mọi hành vi trái pháp luật Việt Nam, hoặc nội dung xâm phạm quyền tác giả, nhãn hiệu, quyền riêng tư hay quyền khác của người thứ ba.",
          "Quấy rối, đe dọa, phát ngôn thù hận, nội dung tình dục liên quan đến trẻ vị thành niên, hoặc công bố thông tin riêng tư của người khác.",
          "Spam, quảng cáo không mời, liên kết lừa đảo, mã độc hoặc tấn công giả mạo.",
          "Thu thập tự động, thu thập hàng loạt hoặc sao chép có hệ thống nội dung của thành viên khác, và dùng nội dung đó để huấn luyện hệ thống học máy hay AI.",
          "Vượt qua giới hạn tần suất, cơ chế kiểm soát truy cập hoặc thiết lập hiển thị mà thành viên khác đã chọn; dò quét, kiểm thử tải hoặc tấn công hệ thống khi chưa được cho phép bằng văn bản.",
          "Dịch ngược, sao chép hoặc phân phối lại bản thân phần mềm — xem mục về mã nguồn bên dưới.",
          "Mạo danh chủ sở hữu, quản trị viên hoặc thành viên khác.",
        ],
      },
      {
        id: "uploads",
        heading: "8. Tệp bạn tải lên",
        paragraphs: [
          "Tệp tải lên được kiểm tra theo loại, kích thước và chữ ký tệp. Giới hạn hiện tại: ảnh tối đa 3 MB (GIF tối đa 8 MB), PDF và DOCX tối đa 10 MB, văn bản thuần và Markdown tối đa 512 KB, âm thanh tối đa 5 MB, và tối đa 10 tệp đính kèm cho mỗi bài viết.",
          "Tệp vượt giới hạn hoặc vi phạm quy tắc sử dụng hợp lệ có thể bị xoá mà không cần báo trước. Dịch vụ lưu trữ ở đây không phải dịch vụ sao lưu — hãy giữ bản gốc của bạn.",
        ],
      },
      {
        id: "moderation",
        heading: "9. Kiểm duyệt và xử lý vi phạm",
        paragraphs: [
          "Nếu nội dung hoặc hành vi vi phạm các điều khoản này, chủ sở hữu có thể xoá nội dung, hạn chế một tính năng, tạm ngưng tài khoản, hoặc xoá tài khoản cùng toàn bộ dữ liệu thuộc tài khoản. Khi khả thi và phù hợp pháp luật, việc thông báo và cơ hội giải trình sẽ diễn ra trước; khi rủi ro là tức thời, hành động sẽ diễn ra trước.",
          "Quản trị viên thấy danh sách thành viên, vai trò và số liệu hoạt động tổng hợp; superadmin ngoài ra có thể đọc thông tin chẩn đoán máy chủ và xoá tài khoản. Hãy báo cáo hành vi lạm dụng tới ducbkdn95@gmail.com kèm đủ chi tiết để tìm được nội dung.",
        ],
      },
      {
        id: "code-license",
        heading: "10. Phần mềm là tài sản độc quyền",
        paragraphs: [
          "Các điều khoản này cho phép bạn sử dụng dịch vụ đang được vận hành. Chúng không cấp cho bạn bất kỳ quyền nào đối với mã nguồn, thiết kế hay cấu trúc cơ sở dữ liệu bên dưới — những thứ này là tài sản độc quyền, bảo lưu mọi quyền. Việc sao chép, tự dựng một bản chạy riêng, sửa đổi, phân phối lại hoặc dùng mã nguồn làm dữ liệu huấn luyện AI đều cần sự cho phép trước bằng văn bản của chủ sở hữu.",
          "Tên site, câu chữ và nhận diện hình ảnh thuộc về chủ sở hữu. Nội dung của riêng bạn không thuộc phạm vi mục này — nó vẫn thuộc về bạn như đã nêu ở trên.",
        ],
      },
      {
        id: "privacy",
        heading: "11. Quyền riêng tư",
        paragraphs: [
          "Chính sách bảo mật giải thích dịch vụ ghi nhận những gì, ai xử lý dữ liệu, lưu bao lâu, và cách yêu cầu xuất hoặc xoá dữ liệu. Chính sách đó là một phần của các điều khoản này.",
        ],
      },
      {
        id: "termination",
        heading: "12. Kết thúc thoả thuận",
        paragraphs: [
          "Bạn có thể ngừng sử dụng dịch vụ bất cứ lúc nào và tự xoá bài viết, story, bình luận, task, epic của mình trong ứng dụng. Bạn cũng có thể tự xoá toàn bộ tài khoản trong Cài đặt → Vùng nguy hiểm: hệ thống yêu cầu nhập đúng địa chỉ email và mật khẩu (trừ khi bạn chỉ đăng nhập bằng Google), rồi xoá tài khoản cùng toàn bộ dữ liệu thuộc tài khoản.",
          "Chủ sở hữu có thể kết thúc quyền truy cập của bạn nếu bạn vi phạm các điều khoản này, hoặc khi hệ thống ngừng hoạt động. Việc xoá tài khoản là vĩnh viễn và kéo theo nội dung, tệp và các phiên đăng nhập của bạn; không có thùng rác. Các mục về giấy phép nội dung của bạn, phần mềm độc quyền, miễn trừ bảo đảm, giới hạn trách nhiệm và luật áp dụng vẫn có hiệu lực sau khi thoả thuận kết thúc.",
        ],
      },
      {
        id: "disclaimer",
        heading: "13. Không bảo đảm",
        paragraphs: [
          "Dịch vụ được cung cấp nguyên trạng và theo mức khả dụng thực tế, không kèm bất kỳ bảo đảm nào, dù rõ ràng hay mặc định, bao gồm tính phù hợp cho một mục đích cụ thể, tính liên tục của dịch vụ, hay việc dữ liệu sẽ không bao giờ bị mất. Bạn tự chịu rủi ro khi sử dụng.",
          "Nội dung do thành viên đăng thuộc về thành viên đó, không phải của chủ sở hữu, và không được chủ sở hữu xác nhận hay kiểm chứng.",
        ],
      },
      {
        id: "liability",
        heading: "14. Giới hạn trách nhiệm",
        paragraphs: [
          "Trong phạm vi tối đa pháp luật cho phép, chủ sở hữu không chịu trách nhiệm với thiệt hại gián tiếp, ngẫu nhiên hay hệ quả, với lợi nhuận hoặc cơ hội bị mất, hay với việc dữ liệu bị mất hoặc hỏng phát sinh từ việc bạn sử dụng dịch vụ.",
          "Vì dịch vụ miễn phí, tổng trách nhiệm của chủ sở hữu đối với mọi khiếu kiện được giới hạn ở số tiền bạn đã trả cho dịch vụ, tức là bằng không, trừ trường hợp pháp luật Việt Nam không cho phép giới hạn như vậy.",
        ],
      },
      {
        id: "changes",
        heading: "15. Thay đổi điều khoản",
        paragraphs: [
          "Các điều khoản này có thể được cập nhật khi dịch vụ thay đổi. Ngày ở đầu trang cho biết phiên bản hiện hành, và những thay đổi đáng kể sẽ được thông báo trên trang chủ công khai. Tiếp tục sử dụng dịch vụ sau khi có thay đổi nghĩa là bạn chấp nhận điều khoản mới; nếu không đồng ý, hãy ngừng sử dụng và tự xoá tài khoản.",
        ],
      },
      {
        id: "governing-law",
        heading: "16. Luật áp dụng và ngôn ngữ",
        paragraphs: [
          "Các điều khoản này được điều chỉnh bởi pháp luật nước Cộng hòa Xã hội Chủ nghĩa Việt Nam, và toà án có thẩm quyền của Việt Nam có thẩm quyền giải quyết duy nhất đối với mọi tranh chấp.",
          "Điều khoản được công bố bằng tiếng Anh và tiếng Việt. Hai bản nhằm diễn đạt cùng một nội dung; nếu có khác biệt, bản tiếng Việt được ưu tiên áp dụng. Nếu một quy định nào bị coi là không thể thi hành, các quy định còn lại vẫn giữ nguyên hiệu lực.",
        ],
      },
      {
        id: "contact",
        heading: "17. Liên hệ",
        paragraphs: [
          "Mọi câu hỏi về điều khoản, báo cáo lạm dụng, yêu cầu xin phép và yêu cầu xoá tài khoản xin gửi tới ducbkdn95@gmail.com.",
        ],
      },
    ],
  },
};
