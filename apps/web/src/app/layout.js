"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const google_1 = require("next/font/google");
require("./globals.css");
const inter = (0, google_1.Inter)({ subsets: ['latin'] });
exports.metadata = {
    title: 'Nova - AI-Orchestrated Operating System',
    description: 'The universal life-and-business operating system that merges trading, e-commerce, and content distribution.',
};
function RootLayout({ children, }) {
    return (<html lang="en">
      <body className={inter.className}>{children}</body>
    </html>);
}
