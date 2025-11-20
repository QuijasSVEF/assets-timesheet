'use client';

import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface SignaturePadProps {
  onEnd: () => void;
}

export interface SignaturePadRef {
  clear: () => void;
  getTrimmedCanvas: () => HTMLCanvasElement;
  isEmpty: () => boolean;
}

const SignaturePad = forwardRef<SignaturePadRef, SignaturePadProps>(({ onEnd }, ref) => {
  const sigCanvas = useRef<SignatureCanvas>(null);

  useImperativeHandle(ref, () => ({
    clear: () => sigCanvas.current?.clear(),
    getTrimmedCanvas: () => sigCanvas.current?.getTrimmedCanvas()!,
    isEmpty: () => sigCanvas.current?.isEmpty() ?? true,
  }));

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden">
      <SignatureCanvas
        ref={sigCanvas}
        penColor="black"
        canvasProps={{
          width: 500,
          height: 200,
          className: 'signature-canvas',
        }}
        onEnd={onEnd}
      />
    </div>
  );
});

SignaturePad.displayName = 'SignaturePad';

export default SignaturePad;
