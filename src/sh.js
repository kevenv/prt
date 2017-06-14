
// order 3
function SHEval3(fX, fY, fZ) {
   var fC0,fC1,fS0,fS1,fTmpA,fTmpB,fTmpC;
   var fZ2 = fZ*fZ;
   var pSH = [0,0,0,0,0,0,0,0,0];

   pSH[0] = 0.2820947917738781;
   pSH[2] = 0.4886025119029199*fZ;
   pSH[6] = 0.9461746957575601*fZ2 + -0.3153915652525201;
   fC0 = fX;
   fS0 = fY;

   fTmpA = -0.48860251190292;
   pSH[3] = fTmpA*fC0;
   pSH[1] = fTmpA*fS0;
   fTmpB = -1.092548430592079*fZ;
   pSH[7] = fTmpB*fC0;
   pSH[5] = fTmpB*fS0;
   fC1 = fX*fC0 - fY*fS0;
   fS1 = fX*fS0 + fY*fC0;

   fTmpC = 0.5462742152960395;
   pSH[8] = fTmpC*fC1;
   pSH[4] = fTmpC*fS1;

   return pSH;
}