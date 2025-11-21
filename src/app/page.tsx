'use client';

import React, { useState, useRef } from 'react';
import SignaturePad, { SignaturePadRef } from '@/components/SignaturePad';

const SCHOOLS = [
    'Mt. Pleasant',
    'ANDREW HILL',
    'YERBA BUENA',
    'W.C. Overfelt',
    'JAMES LICK',
];

const DAYS_MONTH_1 = Array.from({ length: 16 }, (_, i) => i + 16); // 16-31
const DAYS_MONTH_2 = Array.from({ length: 15 }, (_, i) => i + 1);  // 1-15

const ALPHA_CODES = [
    { code: 'A', desc: 'Sub - Personal Necessity 436-1150' },
    { code: 'B', desc: 'Sub - Illness 436-1151' },
    { code: 'C', desc: 'Sub - School Business 437-1152' },
    { code: 'D', desc: 'Sub - Vacant 437-1153' },
    { code: 'E', desc: 'Home Teaching 194' },
    { code: 'F', desc: 'Home Teaching Handicapped 383' },
    { code: 'G', desc: 'Saturday School 176' },
    { code: 'H', desc: 'Summer Counselor' },
    { code: 'I', desc: 'Extra Class 1113' },
    { code: 'J', desc: 'Summer School 187-1110' },
    { code: 'K', desc: 'Admin Supervision 1119' },
];

export default function Home() {
    const [formData, setFormData] = useState({
        school: SCHOOLS[0],
        employeeName: '',
        employeeId: '',
        fte: '',
        hoursPerWeek: '',
        month1: '',
        month2: '',
        year: new Date().getFullYear().toString(),
        position: '',
        location: '', // This might be redundant with school, but keeping as per typical form
        employeeType: 'Classified', // Classified or Certificated
        email: '',
        alphaL: '',
        alphaM: '',
        alphaN: '',
        dateEmployee: '',
        datePrincipal: '',
        dateManager: '',
    });

    const [timesheetData, setTimesheetData] = useState<Record<string, any>>({});
    const [accountCodes, setAccountCodes] = useState(
        Array(3).fill({
            fund: '', location: '', program: '', goal: '', function: '', object: '', resource: '', year: '', manager: '', alpha: '', hours: '', payRate: '', totalPay: ''
        })
    );

    const sigPadRef = useRef<SignaturePadRef>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const calculateDuration = (inTime: string, outTime: string) => {
        if (!inTime || !outTime) return 0;
        const [h1, m1] = inTime.split(':').map(Number);
        const [h2, m2] = outTime.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        return diff > 0 ? diff : 0;
    };

    const formatDuration = (minutes: number) => {
        return minutes > 0 ? (minutes / 60).toFixed(2) : '';
    };

    const handleInputChange = (day: number, field: string, value: string) => {
        setTimesheetData(prev => {
            const newData = { ...prev, [`${day}-${field}`]: value };

            // Auto-calculate totals
            // We have 3 sets: 1, 2, 3
            // If any time field changes, recalculate the specific set total AND the daily total
            if (field.startsWith('in') || field.startsWith('out')) {
                const setNum = field.replace(/^(in|out)/, ''); // '1', '2', '3'

                const inTime = field.startsWith('in') ? value : (newData[`${day}-in${setNum}`] || '');
                const outTime = field.startsWith('out') ? value : (newData[`${day}-out${setNum}`] || '');

                const duration = calculateDuration(inTime, outTime);
                newData[`${day}-total${setNum}`] = formatDuration(duration);

                // Recalculate Daily Total
                // We need to sum up total1, total2, total3 (in minutes to be accurate, then format)
                // But here we only have the formatted strings in state usually. 
                // Let's re-calculate all durations from inputs to be safe.
                let totalDailyMinutes = 0;
                for (let i = 1; i <= 3; i++) {
                    const iIn = newData[`${day}-in${i}`] || '';
                    const iOut = newData[`${day}-out${i}`] || '';
                    totalDailyMinutes += calculateDuration(iIn, iOut);
                }
                newData[`${day}-dailyTotal`] = formatDuration(totalDailyMinutes);
            }

            return newData;
        });
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAccountCodeChange = (index: number, field: string, value: string) => {
        setAccountCodes(prev => {
            const newCodes = [...prev];
            const currentRow = { ...newCodes[index], [field]: value };

            // Auto-calculate Total Pay
            if (field === 'hours' || field === 'payRate') {
                const hours = parseFloat(field === 'hours' ? value : currentRow.hours);
                const rate = parseFloat(field === 'payRate' ? value : currentRow.payRate);
                if (!isNaN(hours) && !isNaN(rate)) {
                    currentRow.totalPay = (hours * rate).toFixed(2);
                }
            }

            newCodes[index] = currentRow;
            return newCodes;
        });
    };

    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isSigned, setIsSigned] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Check both state and ref to be safe, or just state. 
        // Using state is more reliable for React updates.
        if (!isSigned && sigPadRef.current?.isEmpty()) {
            alert('Please sign the timesheet.');
            return;
        }

        setIsSubmitting(true);
        const signatureData = sigPadRef.current?.getTrimmedCanvas().toDataURL('image/png');

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    timesheetData,
                    accountCodes,
                    signatureData,
                }),
            });

            if (response.ok) {
                setShowSuccessModal(true);
                // Optional: Reset form here if needed
            } else {
                const data = await response.json();
                alert(`Failed to submit: ${data.error || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderRow = (day: number) => (
        <tr key={day} className="border-b border-gray-300 h-8">
            <td className="border-r border-gray-300 text-center bg-gray-50 text-xs font-medium text-black w-8">{day}</td>

            {/* Set 1 */}
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'in1', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'out1', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total1`] || ''} className="w-full h-full border-none focus:ring-0 text-xs px-0.5 text-black bg-gray-50 font-medium text-center" tabIndex={-1} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" value={timesheetData[`${day}-code1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 uppercase text-black transition-colors text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code1', e.target.value)} /></td>

            {/* Set 2 */}
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'in2', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'out2', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total2`] || ''} className="w-full h-full border-none focus:ring-0 text-xs px-0.5 text-black bg-gray-50 font-medium text-center" tabIndex={-1} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" value={timesheetData[`${day}-code2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 uppercase text-black transition-colors text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code2', e.target.value)} /></td>

            {/* Set 3 */}
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'in3', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 text-black transition-colors text-center" onChange={(e) => handleInputChange(day, 'out3', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total3`] || ''} className="w-full h-full border-none focus:ring-0 text-xs px-0.5 text-black bg-gray-50 font-medium text-center" tabIndex={-1} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" value={timesheetData[`${day}-code3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 text-xs px-0.5 uppercase text-black transition-colors text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code3', e.target.value)} /></td>

            {/* Daily Total */}
            <td className="p-0"><input type="text" readOnly value={timesheetData[`${day}-dailyTotal`] || ''} className="w-full h-full border-none focus:ring-0 text-xs px-0.5 text-black bg-gray-100 font-bold text-center" tabIndex={-1} /></td>
        </tr>
    );

    return (
        <main className="min-h-screen p-4 bg-gray-100 font-sans relative">
            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full text-center border-2 border-green-500">
                        <div className="text-green-500 text-5xl mb-4">✓</div>
                        <h2 className="text-2xl font-bold mb-2 text-black">Submission Successful!</h2>
                        <p className="text-gray-600 mb-6">Your timesheet has been successfully submitted and saved to Google Drive.</p>
                        <button
                            onClick={() => setShowSuccessModal(false)}
                            className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700 transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <div className="max-w-5xl mx-auto bg-white p-8 shadow-xl border border-gray-300">

                {/* Header */}
                <div className="flex justify-between items-start mb-6 border-b-2 border-black pb-4">
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <img src="/logo.png" alt="ESUHSD Logo" className="w-20 h-20 object-contain" />
                        <div>
                            <h1 className="text-xl font-bold uppercase text-black">East Side Union High School District</h1>
                            <h2 className="text-lg font-bold uppercase text-black">Daily Timesheet</h2>
                        </div>
                    </div>
                    <div className="flex gap-6 text-black">
                        <label className="flex items-center gap-2 font-bold">
                            <input type="radio" name="employeeType" value="Classified" checked={formData.employeeType === 'Classified'} onChange={handleFormChange} />
                            CLASSIFIED
                        </label>
                        <label className="flex items-center gap-2 font-bold">
                            <input type="radio" name="employeeType" value="Certificated" checked={formData.employeeType === 'Certificated'} onChange={handleFormChange} />
                            CERTIFICATED
                        </label>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Employee Info */}
                    <div className="grid grid-cols-12 gap-4 mb-6 text-black">
                        <div className="col-span-6">
                            <label className="block text-xs font-bold uppercase text-black">Employee (Legal Name Only)</label>
                            <input type="text" name="employeeName" required value={formData.employeeName} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 bg-yellow-50 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Employee ID (6-Digits)</label>
                            <input type="text" name="employeeId" value={formData.employeeId} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">FTE</label>
                            <input type="text" name="fte" value={formData.fte} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Hours/Week</label>
                            <input type="text" name="hoursPerWeek" value={formData.hoursPerWeek} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4 mb-8 border-b border-black pb-4 text-black">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Month 1</label>
                            <input type="text" name="month1" value={formData.month1} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black bg-yellow-50 focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Month 2</label>
                            <input type="text" name="month2" value={formData.month2} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Year</label>
                            <input type="text" name="year" value={formData.year} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold uppercase text-black">Position</label>
                            <input type="text" name="position" value={formData.position} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                        <div className="col-span-4">
                            <label className="block text-xs font-bold uppercase text-black">School Site / Location</label>
                            <select name="school" value={formData.school} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 bg-white text-black focus:bg-yellow-100 transition-colors">
                                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="col-span-12">
                            <label className="block text-xs font-bold uppercase text-black">Email (For Receipt)</label>
                            <input type="email" name="email" required value={formData.email} onChange={handleFormChange} className="w-full border-b-2 border-gray-300 focus:border-black outline-none py-1 text-black focus:bg-yellow-100 transition-colors" />
                        </div>
                    </div>

                    {/* Timesheet Grid */}
                    <div className="flex flex-col gap-8 mb-8">
                        {/* Month 1 */}
                        <div className="border-2 border-black">
                            <div className="bg-yellow-100 text-center font-bold py-1 border-b-2 border-black text-black">MONTH 1 (16-31)</div>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-black text-[10px] text-black">
                                        <th className="border-r border-gray-300 w-8">Day</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th>Total Hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {DAYS_MONTH_1.map(day => renderRow(day))}
                                </tbody>
                            </table>
                        </div>

                        {/* Month 2 */}
                        <div className="border-2 border-black">
                            <div className="bg-yellow-100 text-center font-bold py-1 border-b-2 border-black text-black">MONTH 2 (1-15)</div>
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-black text-[10px] text-black">
                                        <th className="border-r border-gray-300 w-8">Day</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th className="border-r border-gray-300">In</th>
                                        <th className="border-r border-gray-300">Out</th>
                                        <th className="border-r border-gray-300">Total</th>
                                        <th className="border-r border-gray-300">Code</th>

                                        <th>Total Hours</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {DAYS_MONTH_2.map(day => renderRow(day))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Account Codes Strip */}
                    <div className="border-2 border-black mb-2 overflow-x-auto">
                        <table className="w-full text-xs text-center text-black border-collapse">
                            <thead>
                                <tr className="bg-gray-100 border-b border-black">
                                    <th className="p-1 border-r border-black border-b border-black">Fund</th>
                                    <th className="p-1 border-r border-black border-b border-black">Location</th>
                                    <th className="p-1 border-r border-black border-b border-black">Program</th>
                                    <th className="p-1 border-r border-black border-b border-black">Goal</th>
                                    <th className="p-1 border-r border-black border-b border-black">Function</th>
                                    <th className="p-1 border-r border-black border-b border-black">Object</th>
                                    <th className="p-1 border-r border-black border-b border-black">Resource</th>
                                    <th className="p-1 border-r border-black border-b border-black">Year</th>
                                    <th className="p-1 border-r border-black border-b border-black">Manager</th>
                                    <th className="p-1 border-r border-black border-b border-black">Alpha</th>
                                    <th className="p-1 border-r border-black border-b border-black">Hours</th>
                                    <th className="p-1 border-r border-black border-b border-black">Pay Rate</th>
                                    <th className="p-1 border-b border-black">Total Pay</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[0, 1, 2].map((index) => (
                                    <tr key={index} className="border-b border-black last:border-b-0">
                                        {['fund', 'location', 'program', 'goal', 'function', 'object', 'resource', 'year', 'manager', 'alpha', 'hours', 'payRate', 'totalPay'].map((field) => (
                                            <td key={field} className="p-0 border-r border-black last:border-r-0">
                                                <input
                                                    type={field === 'hours' || field === 'payRate' ? 'number' : 'text'}
                                                    readOnly={field === 'totalPay'}
                                                    tabIndex={field === 'totalPay' ? -1 : 0}
                                                    value={accountCodes[index]?.[field] || ''}
                                                    onChange={(e) => handleAccountCodeChange(index, field, e.target.value)}
                                                    className={`w-full p-1 text-center outline-none text-black focus:bg-yellow-100 transition-colors ${field === 'totalPay' ? 'bg-gray-100 font-medium' : ''}`}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Grand Total Pay */}
                    <div className="flex justify-end mb-8">
                        <div className="flex items-center border-2 border-black">
                            <div className="font-bold px-4 py-1 border-r-2 border-black bg-gray-100 text-black">Grand Total Pay:</div>
                            <div className="w-32 px-2 py-1 text-right font-bold text-black bg-gray-100">
                                {(() => {
                                    const total = accountCodes.reduce((sum, code) => sum + (parseFloat(code.totalPay) || 0), 0);
                                    return total > 0 ? total.toFixed(2) : '';
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Footer Section: Alpha Codes & Signatures */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 text-black">
                        {/* Alpha Codes */}
                        <div className="border border-black p-2 text-xs">
                            <h3 className="font-bold mb-2 border-b border-gray-300">Alpha Codes</h3>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                {ALPHA_CODES.map(ac => (
                                    <div key={ac.code}><span className="font-bold">{ac.code}</span> {ac.desc}</div>
                                ))}
                                <div className="col-span-2 flex items-center gap-2 mt-1">
                                    <span className="font-bold">L</span>
                                    <input type="text" name="alphaL" placeholder="Description" value={formData.alphaL} onChange={handleFormChange} className="border-b border-gray-300 focus:border-black outline-none w-full text-black focus:bg-yellow-100 transition-colors" />
                                </div>
                                <div className="col-span-2 flex items-center gap-2">
                                    <span className="font-bold">M</span>
                                    <input type="text" name="alphaM" placeholder="Description" value={formData.alphaM} onChange={handleFormChange} className="border-b border-gray-300 focus:border-black outline-none w-full text-black focus:bg-yellow-100 transition-colors" />
                                </div>
                                <div className="col-span-2 flex items-center gap-2">
                                    <span className="font-bold">N</span>
                                    <input type="text" name="alphaN" placeholder="Description" value={formData.alphaN} onChange={handleFormChange} className="border-b border-gray-300 focus:border-black outline-none w-full text-black focus:bg-yellow-100 transition-colors" />
                                </div>
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="block text-xs font-bold uppercase text-black">Employee Signature</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold">DATE</span>
                                        <input type="date" name="dateEmployee" value={formData.dateEmployee} onChange={handleFormChange} className="border-b border-black outline-none text-xs w-32 bg-transparent" />
                                    </div>
                                </div>
                                <SignaturePad ref={sigPadRef} onEnd={() => setIsSigned(true)} />
                                <button type="button" onClick={() => {
                                    if (confirm('Are you sure you want to clear the signature?')) {
                                        sigPadRef.current?.clear();
                                        setIsSigned(false);
                                    }
                                }} className="text-xs text-red-500 mt-1 hover:underline">Clear Signature</button>
                            </div>
                            {/* Placeholders for other signatures (not interactive for this user) */}
                            <div className="border-b border-black pt-8 flex justify-between items-end">
                                <span className="text-xs font-bold uppercase text-gray-500">Principal / Supervisor (Office Use)</span>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-gray-500">DATE</span>
                                    <input type="date" name="datePrincipal" value={formData.datePrincipal} onChange={handleFormChange} className="border-b border-black outline-none text-xs w-32 bg-transparent" />
                                </div>
                            </div>
                            <div className="border-b border-black pt-8 flex justify-between items-end">
                                <span className="text-xs font-bold uppercase text-gray-500">Program Manager (Office Use)</span>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-gray-500">DATE</span>
                                    <input type="date" name="dateManager" value={formData.dateManager} onChange={handleFormChange} className="border-b border-black outline-none text-xs w-32 bg-transparent" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div className="text-xs text-red-600 font-bold mt-4 text-center">
                        As per CA Labor Code Section 512, an employee with a work period of more than five hours per day must take a meal period of not less than 30 minutes; an employee with a work period of more than ten hours per day must take a second meal period of not less than 30 minutes.
                    </div>

                    <div className="flex justify-end">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-blue-900 text-white px-8 py-3 rounded shadow-lg hover:bg-blue-800 disabled:opacity-50 font-bold uppercase tracking-wider"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit Timesheet'}
                        </button>
                    </div>

                </form>
            </div>
        </main>
    );
}
