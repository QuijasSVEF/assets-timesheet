import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            school, employeeName, employeeId, fte, hoursPerWeek,
            month1, month2, year, position, employeeType, email,
            timesheetData, accountCodes, signatureData,
            alphaL, alphaM, alphaN,
            dateEmployee, datePrincipal, dateManager
        } = body;

        // 1. Generate PDF
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]); // Standard Letter Size
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Layout Constants
        const MARGIN_LEFT = 30;
        const MARGIN_RIGHT = 30;
        const PAGE_WIDTH = width - MARGIN_LEFT - MARGIN_RIGHT; // ~552

        // Row Heights - COMPRESSED
        const GRID_ROW_HEIGHT = 11;
        const GRID_HEADER_HEIGHT = 12;

        // --- Helper Functions ---
        const drawText = (text: string, x: number, y: number, size: number = 9, fontToUse = font, align: 'left' | 'center' | 'right' = 'left', width: number = 0) => {
            if (!text) return;
            const textWidth = fontToUse.widthOfTextAtSize(text, size);
            let xPos = x;
            if (align === 'center') xPos = x + (width - textWidth) / 2;
            else if (align === 'right') xPos = x + width - textWidth;
            page.drawText(text, { x: xPos, y, size, font: fontToUse });
        };

        const drawLabelValue = (label: string, value: string, x: number, y: number, w: number) => {
            // Label
            drawText(label, x, y + 9, 6, boldFont); // Smaller label font
            // Line
            page.drawLine({ start: { x, y: y }, end: { x: x + w, y: y }, thickness: 0.5, color: rgb(0, 0, 0) });
            // Value
            if (value) drawText(value, x + 2, y + 2, 8, font); // Smaller value font
        };

        const drawCell = (text: string, x: number, y: number, w: number, h: number, fontSize: number = 8, fontToUse = font, align: 'left' | 'center' = 'left') => {
            page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
            drawText(text, x, y + (h - fontSize) / 2 + 1, fontSize, fontToUse, align, w);
        };

        let y = height - 30; // Start Higher (was 40)

        // --- 1. Header Section ---
        // Logo
        try {
            const logoPath = path.join(process.cwd(), 'public', 'logo.png');
            const logoBytes = await fs.readFile(logoPath);
            const logoImage = await pdfDoc.embedPng(logoBytes);
            const logoDims = logoImage.scale(0.18); // Slightly smaller logo
            page.drawImage(logoImage, {
                x: MARGIN_LEFT,
                y: y - logoDims.height,
                width: logoDims.width,
                height: logoDims.height,
            });
        } catch (e) {
            // Ignore logo error
        }

        // District Name & Title
        const headerTextX = MARGIN_LEFT + 80;
        drawText('EAST SIDE UNION HIGH SCHOOL DISTRICT', headerTextX, y - 10, 11, boldFont);
        drawText('DAILY TIMESHEET', headerTextX, y - 24, 13, boldFont);

        // Checkboxes
        const cbY = y - 18;
        // Classified
        page.drawRectangle({ x: 400, y: cbY, width: 10, height: 10, borderColor: rgb(0, 0, 0), borderWidth: 1 });
        if (employeeType === 'Classified') drawText('X', 401, cbY + 1, 8, boldFont);
        drawText('CLASSIFIED', 414, cbY + 1, 7, boldFont);

        // Certificated
        page.drawRectangle({ x: 480, y: cbY, width: 10, height: 10, borderColor: rgb(0, 0, 0), borderWidth: 1 });
        if (employeeType === 'Certificated') drawText('X', 481, cbY + 1, 8, boldFont);
        drawText('CERTIFICATED', 494, cbY + 1, 7, boldFont);

        y -= 50; // Tighter section spacing (was 60)

        // --- 2. Employee Info Section ---
        const r1Y = y;
        const nameWidth = 250;
        drawLabelValue('EMPLOYEE (Legal Name Only)', employeeName, MARGIN_LEFT, r1Y, nameWidth);
        drawLabelValue('EMPLOYEE ID', employeeId, MARGIN_LEFT + nameWidth + 10, r1Y, 80);
        drawLabelValue('FTE', fte, MARGIN_LEFT + 350, r1Y, 60);
        drawLabelValue('HOURS/WEEK', hoursPerWeek, MARGIN_LEFT + 420, r1Y, PAGE_WIDTH - 420);

        y -= 25; // Tighter (was 30)
        const r2Y = y;
        drawLabelValue('MONTH 1', month1, MARGIN_LEFT, r2Y, 60);
        drawLabelValue('MONTH 2', month2, MARGIN_LEFT + 70, r2Y, 60);
        drawLabelValue('YEAR', year, MARGIN_LEFT + 140, r2Y, 50);
        drawLabelValue('POSITION', position, MARGIN_LEFT + 200, r2Y, 150);
        drawLabelValue('LOCATION', school, MARGIN_LEFT + 360, r2Y, PAGE_WIDTH - 360);

        y -= 25; // Keep tight
        drawLabelValue('EMAIL (For Receipt)', email, MARGIN_LEFT, y, 300);

        y -= 15; // Tighter before grid (was 20-25)

        // --- 3. Timesheet Grids ---

        const W_DAY = 25;
        const W_TIME = 35;
        const W_TOT = 35;
        const W_CODE = 25;
        const W_SET = W_TIME + W_TIME + W_TOT + W_CODE; // 130
        const W_DAILY_TOT = PAGE_WIDTH - W_DAY - (W_SET * 3);

        const colWidths = [W_DAY,
            W_TIME, W_TIME, W_TOT, W_CODE,
            W_TIME, W_TIME, W_TOT, W_CODE,
            W_TIME, W_TIME, W_TOT, W_CODE,
            W_DAILY_TOT
        ];

        const drawGridHeader = (yPos: number) => {
            let curX = MARGIN_LEFT;
            const headers = ['Day',
                'In', 'Out', 'Total', 'Code',
                'In', 'Out', 'Total', 'Code',
                'In', 'Out', 'Total', 'Code',
                'Total Hours'
            ];
            headers.forEach((h, i) => {
                drawCell(h, curX, yPos, colWidths[i], GRID_HEADER_HEIGHT, 6, boldFont, 'center'); // Font 6
                curX += colWidths[i];
            });
        };

        const formatTo12Hour = (time24: string) => {
            if (!time24) return '';
            const [h, m] = time24.split(':').map(Number);
            if (isNaN(h) || isNaN(m)) return time24;
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
        };

        const parseDuration = (dur: string) => parseFloat(dur) || 0;

        let totalHoursCalculated = 0;

        // Month 1
        page.drawRectangle({ x: MARGIN_LEFT, y: y, width: PAGE_WIDTH, height: 12, color: rgb(1, 1, 0.9) });
        drawText('MONTH 1 (16-31)', MARGIN_LEFT + 5, y + 2, 8, boldFont);
        y -= GRID_HEADER_HEIGHT;
        drawGridHeader(y);
        y -= GRID_ROW_HEIGHT;

        const daysMonth1 = Array.from({ length: 16 }, (_, i) => i + 16);
        for (const day of daysMonth1) {
            let curX = MARGIN_LEFT;
            const d = (k: string) => timesheetData[`${day}-${k}`] || '';
            const dailyTotal = parseFloat(d('dailyTotal')) || 0;
            totalHoursCalculated += dailyTotal;

            const vals = [
                day.toString(),
                formatTo12Hour(d('in1')), formatTo12Hour(d('out1')), d('total1'), d('code1'),
                formatTo12Hour(d('in2')), formatTo12Hour(d('out2')), d('total2'), d('code2'),
                formatTo12Hour(d('in3')), formatTo12Hour(d('out3')), d('total3'), d('code3'),
                d('dailyTotal')
            ];
            vals.forEach((v, i) => {
                drawCell(v, curX, y, colWidths[i], GRID_ROW_HEIGHT, 7, font, i === 0 ? 'center' : 'center'); // Font 7
                curX += colWidths[i];
            });
            y -= GRID_ROW_HEIGHT;
        }

        y -= 5; // Spacing

        // Month 2
        page.drawRectangle({ x: MARGIN_LEFT, y: y, width: PAGE_WIDTH, height: 12, color: rgb(1, 1, 0.9) });
        drawText('MONTH 2 (1-15)', MARGIN_LEFT + 5, y + 2, 8, boldFont);
        y -= GRID_HEADER_HEIGHT;
        drawGridHeader(y);
        y -= GRID_ROW_HEIGHT;

        const daysMonth2 = Array.from({ length: 15 }, (_, i) => i + 1);
        for (const day of daysMonth2) {
            let curX = MARGIN_LEFT;
            const d = (k: string) => timesheetData[`${day}-${k}`] || '';
            const dailyTotal = parseFloat(d('dailyTotal')) || 0;
            totalHoursCalculated += dailyTotal;

            const vals = [
                day.toString(),
                formatTo12Hour(d('in1')), formatTo12Hour(d('out1')), d('total1'), d('code1'),
                formatTo12Hour(d('in2')), formatTo12Hour(d('out2')), d('total2'), d('code2'),
                formatTo12Hour(d('in3')), formatTo12Hour(d('out3')), d('total3'), d('code3'),
                d('dailyTotal')
            ];
            vals.forEach((v, i) => {
                drawCell(v, curX, y, colWidths[i], GRID_ROW_HEIGHT, 7, font, i === 0 ? 'center' : 'center'); // Font 7
                curX += colWidths[i];
            });
            y -= GRID_ROW_HEIGHT;
        }

        y -= 8; // Tighter

        // --- 4. Account Codes ---
        const acTitles = ['Fund', 'Location', 'Program', 'Goal', 'Function', 'Object', 'Resource', 'Year', 'Manager', 'Alpha', 'Hours', 'Pay Rate', 'Total Pay'];
        const wPerCol = PAGE_WIDTH / 13;

        let curX = MARGIN_LEFT;
        acTitles.forEach(t => {
            drawCell(t, curX, y, wPerCol, GRID_HEADER_HEIGHT, 5, boldFont, 'center'); // Font 5
            curX += wPerCol;
        });
        y -= GRID_ROW_HEIGHT;

        let grandTotal = 0;

        // 3 Rows fixed
        for (let i = 0; i < 3; i++) {
            curX = MARGIN_LEFT;
            const ac = accountCodes[i] || {};
            // Auto-fill hours for first row if empty
            let hoursVal = ac.hours;
            if (i === 0 && !hoursVal && totalHoursCalculated > 0) {
                hoursVal = totalHoursCalculated.toFixed(2);
            }
            // Recalculate total pay for that row if we auto-filled hours and payRate is present
            let totalPayVal = ac.totalPay;
            if (i === 0 && !ac.hours && ac.payRate && hoursVal) {
                totalPayVal = (parseFloat(hoursVal) * parseFloat(ac.payRate)).toFixed(2);
            }

            const vals = [ac.fund, ac.location, ac.program, ac.goal, ac.function, ac.object, ac.resource, ac.year, ac.manager, ac.alpha, hoursVal, ac.payRate, totalPayVal];
            vals.forEach(v => {
                drawCell(v || '', curX, y, wPerCol, GRID_ROW_HEIGHT, 7, font, 'center');
                curX += wPerCol;
            });
            if (totalPayVal) grandTotal += parseFloat(totalPayVal) || 0;
            y -= GRID_ROW_HEIGHT;
        }

        // Grand Total
        const gtBoxWidth = wPerCol * 2;
        const gtLabelWidth = 100;
        const gtX = MARGIN_LEFT + PAGE_WIDTH - gtBoxWidth;
        drawText('Grand Total Pay:', gtX - gtLabelWidth - 5, y + 3, 8, boldFont, 'right', gtLabelWidth);
        page.drawRectangle({ x: gtX, y: y, width: gtBoxWidth, height: GRID_ROW_HEIGHT + 2, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
        if (grandTotal > 0) {
            drawText(grandTotal.toFixed(2), gtX, y + 2, 9, boldFont, 'center', gtBoxWidth);
        }

        y -= 15; // Tighter before Footer

        // --- 5. Footer (Alpha Codes & Signatures) ---
        // Side by Side
        const footerYStart = y;

        // Left: Alpha Codes
        const alphaBoxWidth = 200;
        const alphaBoxHeight = 75; // Reduced height
        page.drawRectangle({ x: MARGIN_LEFT, y: footerYStart - alphaBoxHeight, width: alphaBoxWidth, height: alphaBoxHeight, borderColor: rgb(0, 0, 0), borderWidth: 1 });
        drawText('Alpha Codes', MARGIN_LEFT + 5, footerYStart - 10, 7, boldFont);

        const codes = [
            'A: Sub - Personal Nec.', 'B: Sub - Illness', 'C: Sub - School Bus.', 'D: Sub - Vacant',
            'E: Home Teaching', 'F: Home Teaching Handi.', 'G: Saturday School', 'H: Summer Counselor',
            'I: Extra Class', 'J: Summer School', 'K: Admin Sup.'
        ];
        let acY = footerYStart - 18;
        let acX = MARGIN_LEFT + 5;
        // split into 2 cols inside box
        codes.forEach((c, i) => {
            if (i === 6) { // new col
                acX += 100;
                acY = footerYStart - 18;
            }
            drawText(c, acX, acY, 5, font);
            acY -= 7; // tighter
        });

        // User inputs L, M, N
        acY = footerYStart - 18 - (7 * 5);
        drawText(`L: ${alphaL || ''}`, MARGIN_LEFT + 5, acY - 4, 5, font);
        drawText(`M: ${alphaM || ''}`, MARGIN_LEFT + 50, acY - 4, 5, font);
        drawText(`N: ${alphaN || ''}`, MARGIN_LEFT + 100, acY - 4, 5, font);

        // Right: Signatures
        const sigX = MARGIN_LEFT + alphaBoxWidth + 20;
        const sigWidth = PAGE_WIDTH - alphaBoxWidth - 20;

        let sigY = footerYStart;

        // Helper
        const drawSigLine = (title: string, dateVal: string, yPos: number) => {
            // Title
            drawText(title, sigX, yPos - 8, 6, boldFont);
            // Line
            page.drawLine({ start: { x: sigX, y: yPos }, end: { x: sigX + 180, y: yPos }, thickness: 0.5 });

            // Date Label + Line
            drawText('DATE', sigX + 185, yPos - 8, 6, boldFont);
            page.drawLine({ start: { x: sigX + 210, y: yPos }, end: { x: sigX + sigWidth, y: yPos }, thickness: 0.5 });
            if (dateVal) drawText(dateVal, sigX + 215, yPos + 2, 8, font);
        };

        // Employee Sig
        // Line y positions
        const sigLine1Y = sigY - 15;
        drawSigLine('EMPLOYEE SIGNATURE', dateEmployee, sigLine1Y);
        // Signature Image
        if (signatureData) {
            try {
                let imageBytes: Buffer | undefined;
                let isPng = true;

                if (typeof signatureData === 'string' && signatureData.includes('base64,')) {
                    const matches = signatureData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
                    if (matches) {
                        const type = matches[1];
                        const data = matches[2];
                        imageBytes = Buffer.from(data, 'base64');
                        isPng = type === 'png';
                    } else {
                        // Fallback: try stripping metadata blindly
                        const split = signatureData.split('base64,');
                        if (split.length > 1) {
                            imageBytes = Buffer.from(split[1], 'base64');
                            // Guess type based on first few bytes or just try PNG
                            isPng = signatureData.includes('image/png');
                        }
                    }
                } else {
                    // Assume raw base64 string
                    imageBytes = Buffer.from(signatureData, 'base64');
                }

                if (imageBytes) {
                    const sigImg = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
                    // Scale logic - Resize safely
                    // Scale down to fit height of ~40, preserving aspect ratio
                    const maxHeight = 25;
                    const scale = maxHeight / sigImg.height;
                    const sDims = sigImg.scale(scale); // Scale to fit height

                    page.drawImage(sigImg, {
                        x: sigX + 5,
                        y: sigLine1Y + 2, // Position slightly above the line
                        width: sDims.width,
                        height: sDims.height
                    });
                }
            } catch (sigErr) {
                console.error('Error embedding signature:', sigErr);
                // Continue without signature if it fails, or allow it to throw? 
                // Better to throw so user knows, but maybe log is enough?
                // Throwing effectively alerts the frontend.
                throw new Error('Failed to process signature image. Please ensure it is a valid PNG or JPG.');
            }
        }

        const sigLine2Y = sigLine1Y - 30;
        drawSigLine('PRINCIPAL / SUPERVISOR', datePrincipal, sigLine2Y);

        const sigLine3Y = sigLine2Y - 30;
        drawSigLine('PROGRAM MANAGER', dateManager, sigLine3Y);

        // --- Disclaimer ---
        const disclaimerPart1 = "As per CA Labor Code Section 512, an employee with a work period of more than five hours per day must take a meal";
        const disclaimerPart2 = "period of not less than 30 minutes; an employee with a work period of more than ten hours per day must take a second";
        const disclaimerPart3 = "meal period of not less than 30 minutes.";

        // Red Color
        const redColor = rgb(1, 0, 0);

        page.drawText(disclaimerPart1, { x: MARGIN_LEFT + (PAGE_WIDTH - font.widthOfTextAtSize(disclaimerPart1, 6)) / 2, y: 25, size: 6, font: font, color: redColor });
        page.drawText(disclaimerPart2, { x: MARGIN_LEFT + (PAGE_WIDTH - font.widthOfTextAtSize(disclaimerPart2, 6)) / 2, y: 18, size: 6, font: font, color: redColor });
        page.drawText(disclaimerPart3, { x: MARGIN_LEFT + (PAGE_WIDTH - font.widthOfTextAtSize(disclaimerPart3, 6)) / 2, y: 11, size: 6, font: font, color: redColor });

        const pdfBytes = await pdfDoc.save();

        // 2. Upload to Google Drive (Unchanged logic)
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive.file'],
        });

        const drive = google.drive({ version: 'v3', auth });

        const fileMetadata = {
            name: `Timesheet_${employeeName}_${new Date().toISOString().split('T')[0]}.pdf`,
            parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!],
        };

        const media = {
            mimeType: 'application/pdf',
            body: Readable.from(Buffer.from(pdfBytes)),
        };

        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
            supportsAllDrives: true,
        });

        return NextResponse.json({ success: true, fileId: file.data.id });

    } catch (error: any) {
        console.error('Error processing request:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
