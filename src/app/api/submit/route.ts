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
        const page = pdfDoc.addPage();
        const { width, height } = page.getSize();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Helper to draw text
        const drawText = (text: string, x: number, y: number, size: number = 10, fontToUse = font) => {
            page.drawText(text || '', { x, y, size, font: fontToUse });
        };

        let y = height - 50; // Initial Y position for content

        // Embed Logo
        try {
            const logoPath = path.join(process.cwd(), 'public', 'logo.png');
            const logoBytes = await fs.readFile(logoPath);
            const logoImage = await pdfDoc.embedPng(logoBytes);
            const logoDims = logoImage.scale(0.25); // Adjust scale as needed
            page.drawImage(logoImage, {
                x: 50,
                y: y - logoDims.height,
                width: logoDims.width,
                height: logoDims.height,
            });
        } catch (e) {
            console.error("Error loading logo:", e);
            // Proceed without logo if it fails
        }

        // Header Text (Adjusted X position to be next to logo)
        // Align text with the top of the logo area
        page.drawText('EAST SIDE UNION HIGH SCHOOL DISTRICT', { x: 130, y: y - 15, size: 14, font: boldFont });
        page.drawText('DAILY TIMESHEET', { x: 130, y: y - 35, size: 18, font: boldFont });

        // Employee Type Checkboxes (Moved further right to avoid overlap)
        // Adjusted to be more compact and aligned
        page.drawText('[' + (employeeType === 'Classified' ? 'X' : ' ') + '] CLASSIFIED', { x: 430, y: y - 15, size: 9 });
        page.drawText('[' + (employeeType === 'Certificated' ? 'X' : ' ') + '] CERTIFICATED', { x: 500, y: y - 15, size: 9 });

        y -= 80; // Move y down after header and logo

        // Helper to draw label and value with an underline
        const drawLabelValue = (label: string, value: string, x: number, yPos: number, w: number) => {
            page.drawText(label, { x, y: yPos + 10, size: 8, font: boldFont });
            page.drawLine({ start: { x, y: yPos }, end: { x: x + w, y: yPos }, thickness: 1, color: rgb(0, 0, 0) });
            if (value) page.drawText(value, { x, y: yPos + 2, size: 10, font });
        };

        // Employee Info Row 1 (using new helper)
        // Adjusted widths to fill page (approx 512 width)
        drawLabelValue('EMPLOYEE (Legal Name Only)', employeeName, 50, y, 250);
        drawLabelValue('EMPLOYEE ID', employeeId, 310, y, 80);
        drawLabelValue('FTE', fte, 400, y, 60);
        drawLabelValue('HOURS/WEEK', hoursPerWeek, 470, y, 90);
        y -= 35;

        // Employee Info Row 2
        drawLabelValue('MONTH 1', month1, 50, y, 80);
        drawLabelValue('MONTH 2', month2, 140, y, 80);
        drawLabelValue('YEAR', year, 230, y, 60);
        drawLabelValue('POSITION', position, 300, y, 150);
        drawLabelValue('SCHOOL SITE / LOCATION', school, 460, y, 100);
        y -= 35;

        // Employee Info Row 3 (Email)
        drawLabelValue('EMAIL', email, 50, y, 510);

        // Timesheet Grid
        y -= 40;

        let currentPage = page; // Ensure currentPage is correctly initialized

        // Helper to draw a cell with border
        const drawCell = (text: string, x: number, yPos: number, w: number, h: number, fontSize: number = 10, fontToUse = font, align: 'left' | 'center' = 'left') => {
            currentPage.drawRectangle({ x, y: yPos, width: w, height: h, borderColor: rgb(0, 0, 0), borderWidth: 1 });
            if (text) {
                const textWidth = fontToUse.widthOfTextAtSize(text, fontSize);
                const textX = align === 'center' ? x + (w - textWidth) / 2 : x + 2;
                const textY = yPos + (h - fontSize) / 2 + 2;
                currentPage.drawText(text, { x: textX, y: textY, size: fontSize, font: fontToUse });
            }
        };

        // Column widths for Timesheet - Widened to fill page (Total ~512)
        // Day: 30
        // Set: 38, 38, 38, 28 = 142 * 3 = 426
        // Total: 50
        // Sum: 30 + 426 + 50 = 506
        const colWidths = [30, 38, 38, 38, 28, 38, 38, 38, 28, 38, 38, 38, 28, 50];
        // Headers: Day, In1, Out1, Tot1, Cod1, In2, Out2, Tot2, Cod2, In3, Out3, Tot3, Cod3, DailyTot

        const totalGridWidth = colWidths.reduce((a, b) => a + b, 0);
        const startX = 50;
        const rowHeight = 20;

        // Draw Header Row
        const drawTimesheetHeader = (yPos: number) => {
            let currentX = startX;
            const headers = ['Day', 'In', 'Out', 'Tot', 'Cd', 'In', 'Out', 'Tot', 'Cd', 'In', 'Out', 'Tot', 'Cd', 'Total'];
            headers.forEach((h, i) => {
                drawCell(h, currentX, yPos, colWidths[i], rowHeight, 8, boldFont, 'center');
                currentX += colWidths[i];
            });
        };

        // Month 1 (16-31)
        currentPage.drawText('MONTH 1 (16-31)', { x: startX, y, size: 10, font: boldFont });
        y -= 20;
        drawTimesheetHeader(y);
        y -= rowHeight;

        const daysMonth1 = Array.from({ length: 16 }, (_, i) => i + 16);
        daysMonth1.forEach(day => {
            if (y < 50) { currentPage = pdfDoc.addPage(); y = height - 50; drawTimesheetHeader(y); y -= rowHeight; }
            let currentX = startX;

            // Extract data for 3 sets
            const d = (field: string) => timesheetData[`${day}-${field}`] || '';

            const rowData = [
                day.toString(),
                d('in1'), d('out1'), d('total1'), d('code1'),
                d('in2'), d('out2'), d('total2'), d('code2'),
                d('in3'), d('out3'), d('total3'), d('code3'),
                d('dailyTotal')
            ];

            rowData.forEach((val, i) => {
                drawCell(val, currentX, y, colWidths[i], rowHeight, 8, font, i === 0 ? 'center' : 'left');
                currentX += colWidths[i];
            });
            y -= rowHeight;
        });

        // Month 2 (1-15)
        y -= 20;
        if (y < 100) { currentPage = pdfDoc.addPage(); y = height - 50; }
        currentPage.drawText('MONTH 2 (1-15)', { x: startX, y, size: 10, font: boldFont });
        y -= 20;
        drawTimesheetHeader(y);
        y -= rowHeight;

        const daysMonth2 = Array.from({ length: 15 }, (_, i) => i + 1);
        daysMonth2.forEach(day => {
            if (y < 50) { currentPage = pdfDoc.addPage(); y = height - 50; drawTimesheetHeader(y); y -= rowHeight; }
            let currentX = startX;

            // Extract data for 3 sets
            const d = (field: string) => timesheetData[`${day}-${field}`] || '';

            const rowData = [
                day.toString(),
                d('in1'), d('out1'), d('total1'), d('code1'),
                d('in2'), d('out2'), d('total2'), d('code2'),
                d('in3'), d('out3'), d('total3'), d('code3'),
                d('dailyTotal')
            ];

            rowData.forEach((val, i) => {
                drawCell(val, currentX, y, colWidths[i], rowHeight, 8, font, i === 0 ? 'center' : 'left');
                currentX += colWidths[i];
            });
            y -= rowHeight;
        });

        // Account Codes
        y -= 30;
        if (y < 150) {
            currentPage = pdfDoc.addPage();
            y = height - 50;
        }
        currentPage.drawText('ACCOUNT CODES:', { x: startX, y, size: 10, font: boldFont });
        y -= 20;

        // Widened Account Code Columns to match Timesheet Grid (Total ~512)
        const acHeaders = ['Fund', 'Loc', 'Prog', 'Goal', 'Func', 'Obj', 'Res', 'Yr', 'Mgr', 'Alpha', 'Hrs', 'Rate', 'Total'];
        const acWidths = [35, 35, 35, 35, 35, 35, 35, 35, 50, 35, 35, 50, 62];
        let currentAcX = startX;

        // Header
        acHeaders.forEach((h, i) => {
            drawCell(h, currentAcX, y, acWidths[i], rowHeight, 8, boldFont, 'center');
            currentAcX += acWidths[i];
        });
        y -= rowHeight;

        // Rows
        let grandTotal = 0; // Initialize grand total
        accountCodes.forEach((ac: any) => {
            let x = startX;
            const values = [ac.fund, ac.location, ac.program, ac.goal, ac.function, ac.object, ac.resource, ac.year, ac.manager, ac.alpha, ac.hours, ac.payRate, ac.totalPay];
            values.forEach((v, i) => {
                drawCell(v, x, y, acWidths[i], rowHeight, 8, font, 'center');
                x += acWidths[i];
            });
            if (ac.totalPay) grandTotal += parseFloat(ac.totalPay) || 0; // Sum total pay
            y -= rowHeight;
        });

        // Grand Total Pay Box
        const grandTotalWidth = 62; // Match 'Total' column width
        const grandTotalLabelWidth = 100;
        const grandTotalX = startX + acWidths.slice(0, -1).reduce((a, b) => a + b, 0); // X position for the 'Total' column

        // Label
        currentPage.drawText('Grand Total Pay:', {
            x: grandTotalX - grandTotalLabelWidth - 10, // Position label to the left of the box
            y: y + 5, // Align with the top of the box
            size: 10,
            font: boldFont
        });

        // Value Box
        // Only show if grandTotal > 0
        const grandTotalText = grandTotal > 0 ? grandTotal.toFixed(2) : '';
        drawCell(grandTotalText, grandTotalX, y, grandTotalWidth, rowHeight, 10, boldFont, 'center');
        y -= rowHeight;


        // Alpha Codes Legend
        y -= 30;
        if (y < 100) {
            currentPage = pdfDoc.addPage();
            y = height - 50;
        }
        currentPage.drawText('Alpha Codes:', { x: 50, y: y, size: 10, font: boldFont });
        y -= 15;
        currentPage.drawText(`L: ${alphaL || ''}`, { x: 50, y: y, size: 9, font: font });
        currentPage.drawText(`M: ${alphaM || ''}`, { x: 200, y: y, size: 9, font: font });
        currentPage.drawText(`N: ${alphaN || ''}`, { x: 350, y: y, size: 9, font: font });


        // Signature
        y -= 50;
        if (signatureData) {
            const signatureImage = await pdfDoc.embedPng(signatureData);
            const sigDims = signatureImage.scale(0.5);
            currentPage.drawImage(signatureImage, {
                x: 50,
                y: y - sigDims.height,
                width: sigDims.width,
                height: sigDims.height,
            });
            currentPage.drawText('Employee Signature', { x: 50, y: y - sigDims.height - 15, size: 10, font });

            // Draw Date
            if (dateEmployee) {
                currentPage.drawText(`Date: ${dateEmployee}`, { x: 300, y: y - sigDims.height - 15, size: 10, font });
            }
        } else {
            // Even if no signature, show the line and date
            currentPage.drawLine({ start: { x: 50, y: y - 40 }, end: { x: 250, y: y - 40 }, thickness: 1, color: rgb(0, 0, 0) });
            currentPage.drawText('Employee Signature', { x: 50, y: y - 55, size: 10, font });
            if (dateEmployee) {
                currentPage.drawText(`Date: ${dateEmployee}`, { x: 300, y: y - 55, size: 10, font });
            }
        }

        // Principal / Supervisor
        y -= 120; // Increased spacing from 80 to 120
        if (y < 50) { currentPage = pdfDoc.addPage(); y = height - 50; }
        currentPage.drawLine({ start: { x: 50, y: y }, end: { x: 250, y: y }, thickness: 1, color: rgb(0, 0, 0) });
        currentPage.drawText('Principal / Supervisor', { x: 50, y: y - 15, size: 10, font });
        currentPage.drawText('Date:', { x: 270, y: y, size: 10, font });
        currentPage.drawLine({ start: { x: 300, y: y }, end: { x: 400, y: y }, thickness: 1, color: rgb(0, 0, 0) });
        if (datePrincipal) {
            currentPage.drawText(datePrincipal, { x: 305, y: y + 2, size: 10, font });
        }

        // Program Manager
        y -= 100; // Increased spacing from 80 to 100
        if (y < 50) { currentPage = pdfDoc.addPage(); y = height - 50; }
        currentPage.drawLine({ start: { x: 50, y: y }, end: { x: 250, y: y }, thickness: 1, color: rgb(0, 0, 0) });
        currentPage.drawText('Program Manager', { x: 50, y: y - 15, size: 10, font });
        currentPage.drawText('Date:', { x: 270, y: y, size: 10, font });
        currentPage.drawLine({ start: { x: 300, y: y }, end: { x: 400, y: y }, thickness: 1, color: rgb(0, 0, 0) });
        if (dateManager) {
            currentPage.drawText(dateManager, { x: 305, y: y + 2, size: 10, font });
        }

        // Disclaimer
        const disclaimer = "As per CA Labor Code Section 512, an employee with a work period of more than five hours per day must take a meal period of not less than 30 minutes; an employee with a work period of more than ten hours per day must take a second meal period of not less than 30 minutes.";

        let line = '';
        let dy = 30; // Distance from bottom

        // Add page if not enough space
        if (y < 100) {
            currentPage = pdfDoc.addPage();
            dy = 50;
        } else {
            dy = 50; // Just put it at bottom of current page if space permits, or fixed bottom?
            // Let's put it at the bottom of the page where signature is, or new page.
            // Actually, user wants it at the bottom. Let's put it at absolute bottom of the page.
        }

        const redColor = rgb(1, 0, 0);
        let textY = 50; // Bottom margin

        // We'll draw it at the bottom of the LAST page
        currentPage.drawText(disclaimer, {
            x: 50,
            y: 30,
            size: 8,
            font,
            color: redColor,
            maxWidth: width - 100,
            lineHeight: 10,
        });

        const pdfBytes = await pdfDoc.save();

        // 2. Upload to Google Drive
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
