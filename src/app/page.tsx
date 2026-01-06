'use client';

import React, { useState, useRef, useEffect } from 'react';
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
    { code: 'A', desc: 'Sub - Personal Necessity' },
    { code: 'B', desc: 'Sub - Illness' },
    { code: 'C', desc: 'Sub - School Business' },
    { code: 'D', desc: 'Sub - Vacant' },
    { code: 'E', desc: 'Home Teaching' },
    { code: 'F', desc: 'Home Teach Handi' },
    { code: 'G', desc: 'Saturday School' },
    { code: 'H', desc: 'Summer Counselor' },
    { code: 'I', desc: 'Extra Class' },
    { code: 'J', desc: 'Summer School' },
    { code: 'K', desc: 'Admin Sup.' },
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
        location: '',
        employeeType: 'Classified',
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

            if (field.startsWith('in') || field.startsWith('out')) {
                const setNum = field.replace(/^(in|out)/, '');
                const inTime = field.startsWith('in') ? value : (newData[`${day}-in${setNum}`] || '');
                const outTime = field.startsWith('out') ? value : (newData[`${day}-out${setNum}`] || '');

                const duration = calculateDuration(inTime, outTime);
                newData[`${day}-total${setNum}`] = formatDuration(duration);

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

            if (field === 'hours' || field === 'payRate') {
                const hours = parseFloat(field === 'hours' ? value : currentRow.hours);
                const rate = parseFloat(field === 'payRate' ? value : currentRow.payRate);
                if (!isNaN(hours) && !isNaN(rate) && (field === 'payRate' ? value : currentRow.payRate)) {
                    currentRow.totalPay = (hours * rate).toFixed(2);
                } else {
                    currentRow.totalPay = '';
                }
            }

            newCodes[index] = currentRow;
            return newCodes;
        });
    };

    const [signatureFile, setSignatureFile] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setSignatureFile(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const getTotalHours = () => {
        let total = 0;
        DAYS_MONTH_1.forEach(day => {
            total += parseFloat(timesheetData[`${day}-dailyTotal`] || 0);
        });
        DAYS_MONTH_2.forEach(day => {
            total += parseFloat(timesheetData[`${day}-dailyTotal`] || 0);
        });
        return total.toFixed(2);
    };

    // Auto-sync Total Hours to Account Codes[0]
    useEffect(() => {
        const total = getTotalHours();
        if (parseFloat(total) > 0) {
            setAccountCodes(prev => {
                const newCodes = [...prev];
                // Only update if standard hours have changed to avoid loops/overwrites if not needed, 
                // but here we force sync as per prompt "Can it sum all hours above?"
                const currentRow = { ...newCodes[0] };

                // Update hours
                currentRow.hours = total;

                // Update Total Pay if Rate exists, otherwise clear it
                if (currentRow.payRate) {
                    currentRow.totalPay = (parseFloat(total) * parseFloat(currentRow.payRate)).toFixed(2);
                } else {
                    currentRow.totalPay = '';
                }

                newCodes[0] = currentRow;
                return newCodes;
            });
        }
    }, [timesheetData]);

    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [isSigned, setIsSigned] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Must have either drawn signature OR uploaded file
        if (!isSigned && sigPadRef.current?.isEmpty() && !signatureFile) {
            alert('Please sign the timesheet or upload a signature.');
            return;
        }

        setIsSubmitting(true);
        // Prioritize uploaded file if exists, otherwise use signature pad
        let signatureData: string | null | undefined = signatureFile;
        if (!signatureData && !sigPadRef.current?.isEmpty()) {
            signatureData = sigPadRef.current?.getTrimmedCanvas().toDataURL('image/png');
        }

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
        <tr key={day} className="border-b border-gray-400 h-6 text-xs">
            <td className="border-r border-gray-400 text-center bg-gray-50 text-black w-6 font-bold">{day}</td>

            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'in1', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'out1', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total1`] || ''} className="w-full h-full border-none focus:ring-0 px-0.5 bg-gray-50 text-center font-medium" tabIndex={-1} /></td>
            <td className="border-r border-gray-400 p-0"><input type="text" value={timesheetData[`${day}-code1`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 uppercase text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code1', e.target.value)} /></td>

            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'in2', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'out2', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total2`] || ''} className="w-full h-full border-none focus:ring-0 px-0.5 bg-gray-50 text-center font-medium" tabIndex={-1} /></td>
            <td className="border-r border-gray-400 p-0"><input type="text" value={timesheetData[`${day}-code2`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 uppercase text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code2', e.target.value)} /></td>

            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-in3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'in3', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="time" value={timesheetData[`${day}-out3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 text-center" onChange={(e) => handleInputChange(day, 'out3', e.target.value)} /></td>
            <td className="border-r border-gray-300 p-0"><input type="text" readOnly value={timesheetData[`${day}-total3`] || ''} className="w-full h-full border-none focus:ring-0 px-0.5 bg-gray-50 text-center font-medium" tabIndex={-1} /></td>
            <td className="border-r border-gray-400 p-0"><input type="text" value={timesheetData[`${day}-code3`] || ''} className="w-full h-full border-none focus:ring-0 focus:bg-yellow-100 px-0.5 uppercase text-center" maxLength={2} onChange={(e) => handleInputChange(day, 'code3', e.target.value)} /></td>

            <td className="p-0"><input type="text" readOnly value={timesheetData[`${day}-dailyTotal`] || ''} className="w-full h-full border-none focus:ring-0 px-0.5 bg-gray-100 text-center font-bold" tabIndex={-1} /></td>
        </tr>
    );

    return (
        <main className="min-h-screen p-4 bg-gray-50 font-sans text-black">
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full text-center border-2 border-green-500">
                        <div className="text-green-500 text-5xl mb-4">✓</div>
                        <h2 className="text-2xl font-bold mb-2">Submission Successful!</h2>
                        <button onClick={() => setShowSuccessModal(false)} className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700 mt-4">Close</button>
                    </div>
                </div>
            )}

            <div className="max-w-[900px] mx-auto bg-white p-6 shadow-xl border border-gray-400">
                {/* Header */}
                <div className="flex justify-between items-start mb-4 border-b-2 border-black pb-2">
                    <div className="flex items-center gap-4">
                        <img src="/logo.png" alt="ESUHSD" className="w-16 h-16 object-contain" />
                        <div>
                            <h1 className="text-lg font-bold">EAST SIDE UNION HIGH SCHOOL DISTRICT</h1>
                            <h2 className="text-xl font-bold">DAILY TIMESHEET</h2>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1 text-xs font-bold">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center ${formData.employeeType === 'Classified' ? 'bg-black text-white' : 'bg-white'}`}>
                                {formData.employeeType === 'Classified' && '✓'}
                            </div>
                            <input type="radio" name="employeeType" value="Classified" className="hidden" checked={formData.employeeType === 'Classified'} onChange={handleFormChange} />
                            CLASSIFIED
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <div className={`w-4 h-4 border border-black flex items-center justify-center ${formData.employeeType === 'Certificated' ? 'bg-black text-white' : 'bg-white'}`}>
                                {formData.employeeType === 'Certificated' && '✓'}
                            </div>
                            <input type="radio" name="employeeType" value="Certificated" className="hidden" checked={formData.employeeType === 'Certificated'} onChange={handleFormChange} />
                            CERTIFICATED
                        </label>
                    </div>
                </div>

                <form onSubmit={handleSubmit}>
                    {/* Compact Employee Info */}
                    <div className="grid grid-cols-12 gap-2 mb-4 text-xs">
                        <div className="col-span-6 border-b border-black">
                            <label className="block font-bold">EMPLOYEE (Legal Name Only)</label>
                            <input type="text" name="employeeName" required value={formData.employeeName} onChange={handleFormChange} className="w-full outline-none py-0.5 bg-yellow-50" />
                        </div>
                        <div className="col-span-2 border-b border-black">
                            <label className="block font-bold">EMPLOYEE ID</label>
                            <input type="text" name="employeeId" value={formData.employeeId} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>
                        <div className="col-span-1 border-b border-black">
                            <label className="block font-bold">FTE</label>
                            <input type="text" name="fte" value={formData.fte} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>
                        <div className="col-span-3 border-b border-black">
                            <label className="block font-bold">HOURS/WEEK</label>
                            <input type="text" name="hoursPerWeek" value={formData.hoursPerWeek} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>

                        <div className="col-span-1 border-b border-black">
                            <label className="block font-bold">MONTH 1</label>
                            <input type="text" name="month1" value={formData.month1} onChange={handleFormChange} className="w-full outline-none py-0.5 bg-yellow-50" />
                        </div>
                        <div className="col-span-1 border-b border-black">
                            <label className="block font-bold">MONTH 2</label>
                            <input type="text" name="month2" value={formData.month2} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>
                        <div className="col-span-1 border-b border-black">
                            <label className="block font-bold">YEAR</label>
                            <input type="text" name="year" value={formData.year} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>
                        <div className="col-span-4 border-b border-black">
                            <label className="block font-bold">POSITION</label>
                            <input type="text" name="position" value={formData.position} onChange={handleFormChange} className="w-full outline-none py-0.5" />
                        </div>
                        <div className="col-span-5 border-b border-black">
                            <label className="block font-bold">LOCATION</label>
                            <select name="school" value={formData.school} onChange={handleFormChange} className="w-full outline-none py-0.5 bg-white">
                                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div className="col-span-12 border-b border-black">
                            <label className="block font-bold">EMAIL (For Receipt)</label>
                            <input type="email" name="email" required value={formData.email} onChange={handleFormChange} className="w-full outline-none py-0.5 bg-yellow-50" />
                        </div>
                    </div>

                    {/* Grids */}
                    <div className="space-y-4 mb-4">
                        {/* Month 1 */}
                        <div className="border border-black">
                            <div className="bg-yellow-100 text-center font-bold text-xs border-b border-black">MONTH 1 (16-31)</div>
                            <table className="w-full border-collapse">
                                <thead className="text-[10px] bg-gray-100">
                                    <tr>
                                        <th className="border-r border-gray-400 w-6">Day</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>{DAYS_MONTH_1.map(day => renderRow(day))}</tbody>
                            </table>
                        </div>

                        {/* Month 2 */}
                        <div className="border border-black">
                            <div className="bg-yellow-100 text-center font-bold text-xs border-b border-black">MONTH 2 (1-15)</div>
                            <table className="w-full border-collapse">
                                <thead className="text-[10px] bg-gray-100">
                                    <tr>
                                        <th className="border-r border-gray-400 w-6">Day</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th className="border-r border-gray-300">In</th><th className="border-r border-gray-300">Out</th><th className="border-r border-gray-300">Tot</th><th className="border-r border-gray-400">Cd</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>{DAYS_MONTH_2.map(day => renderRow(day))}</tbody>
                            </table>
                        </div>
                    </div>

                    {/* Account Codes */}
                    <div className="border border-black mb-4 overflow-x-auto">
                        <table className="w-full text-[10px] text-center border-collapse">
                            <thead className="bg-gray-100 font-bold">
                                <tr>
                                    {['Fund', 'Loc', 'Prog', 'Goal', 'Func', 'Obj', 'Res', 'Year', 'Mgr', 'Alpha', 'Hrs', 'Rate', 'Total'].map(h => (
                                        <th key={h} className="border-r border-b border-black p-0.5">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[0, 1, 2].map((i) => (
                                    <tr key={i} className="border-b border-black last:border-b-0">
                                        {['fund', 'location', 'program', 'goal', 'function', 'object', 'resource', 'year', 'manager', 'alpha', 'hours', 'payRate', 'totalPay'].map((f) => (
                                            <td key={f} className="border-r border-black p-0 last:border-r-0">
                                                <input
                                                    type={f === 'hours' || f === 'payRate' ? 'number' : 'text'}
                                                    readOnly={f === 'totalPay'}
                                                    value={accountCodes[i]?.[f] || ''}
                                                    onChange={(e) => handleAccountCodeChange(i, f, e.target.value)}
                                                    className={`w-full text-center outline-none focus:bg-yellow-100 ${f === 'totalPay' ? 'bg-gray-100' : ''}`}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Grand Total */}
                    <div className="flex justify-between items-center mb-4 text-xs font-bold">
                        <div className="text-gray-600">
                            Calculated Total Hours: {getTotalHours()}
                        </div>
                        <div className="flex border border-black items-center">
                            <div className="bg-gray-100 px-3 py-1 border-r border-black">Grand Total Pay:</div>
                            <div className="px-3 py-1 min-w-[80px] text-right">
                                {accountCodes.reduce((sum, c) => sum + (parseFloat(c.totalPay) || 0), 0).toFixed(2)}
                            </div>
                        </div>
                    </div>

                    {/* Footer: Alpha Codes & Signature */}
                    <div className="flex gap-4 mb-4 text-[10px]">
                        {/* Alpha Codes */}
                        <div className="border border-black p-2 w-1/3">
                            <h3 className="font-bold border-b border-gray-400 mb-1">Alpha Codes</h3>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                                {ALPHA_CODES.map(ac => (
                                    <div key={ac.code}><b>{ac.code}</b> {ac.desc}</div>
                                ))}
                            </div>
                            <div className="mt-2 space-y-1">
                                <div className="flex gap-1 items-end"><b>L:</b> <input className="border-b border-black w-full outline-none" value={formData.alphaL} name="alphaL" onChange={handleFormChange} /></div>
                                <div className="flex gap-1 items-end"><b>M:</b> <input className="border-b border-black w-full outline-none" value={formData.alphaM} name="alphaM" onChange={handleFormChange} /></div>
                                <div className="flex gap-1 items-end"><b>N:</b> <input className="border-b border-black w-full outline-none" value={formData.alphaN} name="alphaN" onChange={handleFormChange} /></div>
                            </div>
                        </div>

                        {/* Signatures */}
                        <div className="flex-1 space-y-4">
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="font-bold">EMPLOYEE SIGNATURE</span>
                                    <div className="flex gap-1 items-end">
                                        <span className="font-bold">DATE</span>
                                        <input type="date" name="dateEmployee" value={formData.dateEmployee} onChange={handleFormChange} className="border-b border-black w-24 outline-none bg-transparent" />
                                    </div>
                                </div>
                                <div className="border-b border-black">
                                    <div className="flex flex-col gap-2 mb-2">
                                        <div className="text-[10px] text-gray-500">Sign below OR upload image</div>
                                        <input type="file" accept="image/*" onChange={handleFileChange} className="text-xs" />
                                    </div>
                                    {!signatureFile && <SignaturePad ref={sigPadRef} onEnd={() => setIsSigned(true)} />}
                                    {signatureFile && <img src={signatureFile} alt="Signature" className="h-16 object-contain border border-gray-300 bg-gray-50" />}
                                </div>
                                <button type="button" onClick={() => { if (confirm('Clear?')) { sigPadRef.current?.clear(); setIsSigned(false); setSignatureFile(null); } }} className="text-red-500 hover:underline">Clear</button>
                            </div>

                            <div className="flex justify-between items-end pt-2 border-t border-transparent">
                                <div className="w-1/2 border-b border-black">
                                    <span className="font-bold block mb-4">PRINCIPAL / SUPERVISOR</span>
                                </div>
                                <div className="flex gap-1 items-end w-40">
                                    <span className="font-bold">DATE</span>
                                    <input type="date" name="datePrincipal" value={formData.datePrincipal} onChange={handleFormChange} className="border-b border-black w-full outline-none bg-transparent" />
                                </div>
                            </div>

                            <div className="flex justify-between items-end pt-2">
                                <div className="w-1/2 border-b border-black">
                                    <span className="font-bold block mb-4">PROGRAM MANAGER</span>
                                </div>
                                <div className="flex gap-1 items-end w-40">
                                    <span className="font-bold">DATE</span>
                                    <input type="date" name="dateManager" value={formData.dateManager} onChange={handleFormChange} className="border-b border-black w-full outline-none bg-transparent" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-[10px] text-red-600 font-bold text-center mb-4">
                        As per CA Labor Code Section 512, an employee with a work period of more than five hours per day must take a meal period of not less than 30 minutes; an employee with a work period of more than ten hours per day must take a second meal period of not less than 30 minutes.
                    </div>

                    <div className="flex justify-center">
                        <button type="submit" disabled={isSubmitting} className="bg-blue-900 text-white px-10 py-2 rounded font-bold hover:bg-blue-800 disabled:opacity-50">
                            {isSubmitting ? 'Submitting...' : 'SUBMIT TIMESHEET'}
                        </button>
                    </div>

                </form>
            </div>
        </main>
    );
}
