import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { blogArticles } from "@/app/shop/_components/data";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = blogArticles.find((a) => a.id === slug);
  if (!article) return { title: "Không tìm thấy bài viết" };
  return {
    title: article.title,
    description: article.snippet,
    openGraph: { title: article.title, description: article.snippet, type: "article" },
  };
}

const BODIES: Record<string, { paragraphs: string[]; quote: string; cta: { label: string; href: string } }> = {
  art1: {
    paragraphs: [
      "Danh sách 10 cuốn sách trong bài viết này được Ban Biên Tập Melio tuyển chọn từ các tựa bán chạy nhất tại hệ thống: văn học Việt Nam đương đại, kinh điển thế giới và những cuốn sách kỹ năng sống được bạn đọc đánh giá cao nhất năm 2026.",
      "Tiêu chí chọn rất thực tế: văn phong dễ đọc, bài học áp dụng được ngay vào công việc và đời sống, và có bản dịch hoặc ấn bản tiếng Việt chất lượng tốt đang sẵn hàng tại Melio.",
      "Mỗi cuốn sách đều có trích đoạn đọc thử 3D tại cửa hàng. Bạn có thể ghé chi nhánh gần nhất để chạm tay vào ấn bản thật, hoặc đặt online và nhận tại cửa hàng trong ngày.",
    ],
    quote: "Đọc đúng 10 cuốn sách sâu sắc có giá trị hơn lướt qua 100 cuốn sách một cách hời hợt.",
    cta: { label: "Khám phá tủ sách văn học", href: "/shop?q=v%C4%83n%20h%E1%BB%8Dc" },
  },
  art2: {
    paragraphs: [
      "Phương pháp Atomic Reading rất đơn giản: cố định 30 phút mỗi ngày vào cùng một khung giờ, tắt thông báo điện thoại, và chỉ đọc một cuốn sách tại một thời điểm cho đến hết.",
      "Với tốc độ trung bình 20-25 trang mỗi 30 phút, sau một năm bạn đọc được khoảng 25 cuốn sách dày 250 trang — con số mà hầu hết người bận rộn đều nghĩ là không thể.",
      "Mẹo quan trọng nhất: luôn để sẵn cuốn sách đang đọc dang dở trên bàn làm việc hoặc trong túi. Khi thời gian chết xuất hiện — xếp hàng, chờ xe — bạn có thể đọc thêm 5-10 trang mà không cần sắp xếp.",
    ],
    quote: "Không ai quá bận để đọc sách. Chúng ta chỉ chưa biến việc đọc thành một cuộc hẹn cố định với chính mình.",
    cta: { label: "Tìm cuốn sách tiếp theo của bạn", href: "/shop" },
  },
  art3: {
    paragraphs: [
      "Các nghiên cứu về giáo dục STEAM cho thấy trẻ thường xuyên chơi xếp hình có khả năng hình dung không gian, xoay vật thể trong tâm trí và giải quyết vấn đề từng bước tốt hơn rõ rệt so với nhóm chứng.",
      "Bộ xếp hình LEGO Classic là lựa chọn lý tưởng để bắt đầu: không có đáp án đúng duy nhất, trẻ tự do sáng tạo, tháo ra lắp lại không giới hạn mà không sợ hỏng hay bẩn.",
      "Tại Melio, khu trải nghiệm đồ chơi ở chi nhánh Nguyễn Huệ và Tân Định cho phép bé chơi thử trước khi mua. Nhân viên sẽ gợi ý độ tuổi phù hợp ghi trên từng hộp để phụ huynh chọn đúng.",
    ],
    quote: "Mỗi khối gạch LEGO là một bài toán nhỏ dạy trẻ kiên nhẫn: sai thì tháo ra, làm lại cho đến khi đúng.",
    cta: { label: "Khám phá thế giới LEGO", href: "/toys" },
  },
};

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = blogArticles.find((a) => a.id === slug);
  if (!article) notFound();
  const body = BODIES[article.id] ?? BODIES.art1;
  const related = blogArticles.filter((a) => a.id !== article.id);

  return (
    <main className="min-h-screen bg-[#fbf9f5] text-slate-900 pb-24">
      <div className="bg-[#1c1917] text-white px-4 py-2 text-xs font-bold">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <span className="uppercase tracking-widest text-[10px] text-[#ffd56a]">Tạp chí văn hóa đọc · Melio</span>
          <Link href="/shop" className="hover:underline text-[11px] text-white/90">← Về cửa hàng</Link>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 pt-8">
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#8c2d19] mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Quay lại cửa hàng
        </Link>

        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="text-[#8c2d19] bg-[#faf4ea] border border-[#ede5d8] px-2.5 py-0.5 rounded-full">{article.category}</span>
          <span className="text-slate-400 font-medium">{article.readTime} · {article.date}</span>
        </div>
        <h1 className="font-serif font-black text-3xl sm:text-4xl leading-tight mt-3">{article.title}</h1>
        <p className="text-sm text-slate-600 leading-relaxed italic mt-3 border-l-2 border-[#8c2d19]/30 pl-4">
          &ldquo;{article.snippet}&rdquo;
        </p>

        <div className="mt-6 space-y-4 text-sm sm:text-[15px] text-slate-700 leading-relaxed">
          {body.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <blockquote className="p-5 rounded-2xl bg-gradient-to-br from-[#faf4ea] to-[#f3e5d0] border border-[#e8dac5] font-serif italic text-slate-800">
            &ldquo;{body.quote}&rdquo;
          </blockquote>
        </div>

        <Link
          href={body.cta.href}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-[#1c1917] hover:bg-[#8c2d19] text-white transition-colors"
        >
          <BookOpen className="w-4 h-4" /> {body.cta.label} <ArrowRight className="w-4 h-4" />
        </Link>

        <section className="mt-10 pt-6 border-t border-[#ede5d8]">
          <h2 className="font-serif font-black text-xl mb-4">Bài viết liên quan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/blog/${r.id}`}
                className="p-5 rounded-2xl bg-white border border-[#ede5d8] hover:border-[#8c2d19]/40 hover:shadow-md transition-all group"
              >
                <span className="text-[10px] font-bold text-[#8c2d19] bg-[#faf4ea] px-2 py-0.5 rounded-full">{r.category}</span>
                <h3 className="font-bold text-sm mt-2 group-hover:text-[#8c2d19] leading-snug">{r.title}</h3>
                <span className="text-[11px] text-slate-400 mt-1 block">{r.readTime} · {r.date}</span>
              </Link>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}
