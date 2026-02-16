#define FRAG_COLOR_LOCATION 0

// reference: https://github.com/KhronosGroup/glTF-WebGL-PBR/blob/master/shaders/pbr-frag.glsl

precision highp float;
precision highp int;

// IBL
uniform samplerCube u_DiffuseEnvSampler;
uniform samplerCube u_SpecularEnvSampler;
uniform sampler2D u_brdfLUT;

// Metallic-roughness material

// base color
uniform vec4 u_baseColorFactor;
#ifdef HAS_BASECOLORMAP
uniform sampler2D u_baseColorTexture;
#endif

// normal map
#ifdef HAS_NORMALMAP
uniform sampler2D u_normalTexture;
uniform float u_normalTextureScale;
#endif

// emmisve map
#ifdef HAS_EMISSIVEMAP
uniform sampler2D u_emissiveTexture;
uniform vec3 u_emissiveFactor;
#endif

// metal roughness
#ifdef HAS_METALROUGHNESSMAP
uniform sampler2D u_metallicRoughnessTexture;
#endif
uniform float u_metallicFactor;
uniform float u_roughnessFactor;

// occlusion texture
#ifdef HAS_OCCLUSIONMAP
uniform sampler2D u_occlusionTexture;
uniform float u_occlusionStrength;
#endif

// transmission
#ifdef HAS_TRANSMISSION
uniform sampler2D u_transmissionFramebuffer;
uniform float u_transmissionFactor;
uniform vec2 u_viewportSize;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform mat4 u_ModelMatrix;
#ifdef HAS_TRANSMISSION_TEXTURE
uniform sampler2D u_transmissionTexture;
#endif
#endif

// 왜여기는 Define안되는지 모르겠네... 일단 넘어가자..
//#ifdef HAS_ANISOTROPY
uniform float u_anisotropyStrength;
//#endif

in vec3 v_worldPosition;
in vec3 v_position;
in vec3 v_normal;
in vec2 v_uv;

layout(location = FRAG_COLOR_LOCATION) out vec4 frag_color;

struct PBRInfo
{
    float NdotL;                  // cos angle between normal and light direction
    float NdotV;                  // cos angle between normal and view direction
    float NdotH;                  // cos angle between normal and half vector
    float LdotH;                  // cos angle between light direction and half vector
    float VdotH;                  // cos angle between view direction and half vector
    float perceptualRoughness;    // roughness value, as authored by the model creator (input to shader)
    float metalness;              // metallic value at the surface
    vec3 reflectance0;            // full reflectance color (normal incidence angle)
    vec3 reflectance90;           // reflectance color at grazing angle
    float alphaRoughness;         // roughness mapped to a more linear change in the roughness (proposed by [2])
    vec3 diffuseColor;            // color contribution from diffuse lighting
    vec3 specularColor;           // color contribution from specular lighting

    float anisotropyStrength;     // anisotropy strength
    vec3 anisotropicT;         // anisotropic tangent
    vec3 anisotropicB;         // anisotropic bitangent    
};

const float M_PI = 3.141592653589793;
const float c_MinRoughness = 0.04;

mat3 getTBNMatrix() {
        vec3 pos_dx = dFdx(v_position);
    vec3 pos_dy = dFdy(v_position);
    vec3 tex_dx = dFdx(vec3(v_uv, 0.0));
    vec3 tex_dy = dFdy(vec3(v_uv, 0.0));
    vec3 t = (tex_dy.t * pos_dx - tex_dx.t * pos_dy) / (tex_dx.s * tex_dy.t - tex_dy.s * tex_dx.t);
    vec3 ng = v_normal;

    t = normalize(t - ng * dot(ng, t));
    vec3 b = normalize(cross(ng, t));
    mat3 tbn = mat3(t, b, ng);
    return tbn;
}

// Find the normal for this fragment, pulling either from a predefined normal map
// or from the interpolated mesh normal and tangent attributes.
vec3 getNormal()
{
// #ifdef HAS_NORMALMAP
//     vec3 n = applyNormalMap( v_normal, texture(u_normalTexture, v_uv).rgb );
// #else
//     vec3 n = v_normal;
// #endif
//     return n;
/*
#ifdef HAS_NORMALS
    vec3 ng = normalize(v_normal);
#else
    vec3 ng = cross(pos_dx, pos_dy);
#endif
*/
  
// #else // HAS_TANGENTS
    // mat3 tbn = v_TBN;
// #endif

// TODO: TANGENTS
    mat3 tbn = getTBNMatrix();
#ifdef HAS_NORMALMAP
    vec3 n = texture(u_normalTexture, v_uv).rgb;
    n = normalize(tbn * ((2.0 * n - 1.0) * vec3(u_normalTextureScale, u_normalTextureScale, 1.0)));
#else
    vec3 n = tbn[2].xyz;
#endif
    return n;
}

#ifdef HAS_TRANSMISSION
vec3 getVolumeTransmissionRay(vec3 n, vec3 v, float thickness, float ior, mat4 modelMatrix)
{
    // Direction of refracted light.
    vec3 refractionVector = refract(-v, normalize(n), 1.0 / ior);

    // Compute rotation-independent scaling of the model matrix.
    vec3 modelScale;
    modelScale.x = length(vec3(modelMatrix[0].xyz));
    modelScale.y = length(vec3(modelMatrix[1].xyz));
    modelScale.z = length(vec3(modelMatrix[2].xyz));

    // The thickness is specified in local space.
    return normalize(refractionVector) * thickness * modelScale;
}

float applyIorToRoughness(float roughness, float ior)
{
    // Scale roughness with IOR so that an IOR of 1.0 results in no microfacet refraction and
    // an IOR of 1.5 results in the default amount of microfacet refraction.
    return roughness * clamp(ior * 2.0 - 2.0, 0.0, 1.0);
}


vec3 getIBLVolumeRefraction(PBRInfo pbrInputs, vec3 n, vec3 v, vec3 position, mat4 modelMatrix, vec4 baseColor)
{
    //ior = 1.0 → 굴절 없음 (공기)
    //ior = 1.5 → 약간 굴절 (유리)
    //ior = 2.4 → 많이 굴절 (다이아몬드)
    float ior = 1.5;
    float thickness = 0.02;  // 일단 0으로 (얇은 판 가정)
    float roughness = pbrInputs.perceptualRoughness;
    
    // Step 1: 굴절 ray 계산
    vec3 transmissionRay = getVolumeTransmissionRay(n, v, thickness, ior, modelMatrix);    
    // Step 2: Exit point
    vec3 refractedRayExit = position + transmissionRay;
    
    // Step 3: World → Screen UV
    vec4 ndcPos = u_ProjectionMatrix * u_ViewMatrix * vec4(refractedRayExit, 1.0);
    vec2 refractionCoords = ndcPos.xy / ndcPos.w;
    refractionCoords = refractionCoords * 0.5 + 0.5;
    
    // Step 4: Opaque texture 샘플링
    float framebufferLod = log2(u_viewportSize.x) * applyIorToRoughness(roughness, ior);
    vec3 transmittedLight = textureLod(u_transmissionFramebuffer, refractionCoords, framebufferLod).rgb;
    
    return transmittedLight * baseColor.rgb;
}
#endif

vec3 getIBLContribution(PBRInfo pbrInputs, vec3 n, vec3 reflection, vec4 baseColor)
{
    // float mipCount = 9.0; // resolution of 512x512
    // float mipCount = 10.0; // resolution of 1024x1024
    float mipCount = 10.0; // resolution of 256x256
    float lod = (pbrInputs.perceptualRoughness * mipCount);
    // retrieve a scale and bias to F0. See [1], Figure 3
    vec3 brdf = texture(u_brdfLUT, vec2(pbrInputs.NdotV, 1.0 - pbrInputs.perceptualRoughness)).rgb;
    vec3 diffuseLight = texture(u_DiffuseEnvSampler, n).rgb;

// #ifdef USE_TEX_LOD
    vec3 specularLight = texture(u_SpecularEnvSampler, reflection, lod).rgb;
// #else
    // vec3 specularLight = texture(u_SpecularEnvSampler, reflection).rgb;
// #endif

    vec3 diffuse = diffuseLight * pbrInputs.diffuseColor;
    vec3 specular = specularLight * (pbrInputs.specularColor * brdf.x + brdf.y);

    // // For presentation, this allows us to disable IBL terms
    // diffuse *= u_ScaleIBLAmbient.x;
    // specular *= u_ScaleIBLAmbient.y;

    vec3 ret = vec3(0.0);

#ifdef HAS_TRANSMISSION    
    float transmissionFactor = u_transmissionFactor;
    #ifdef HAS_TRANSMISSION_TEXTURE
        transmissionFactor *= texture(u_transmissionTexture, v_uv).r;
    #endif
    // metallic에서는 tranmission이 일어나지 않음
    transmissionFactor *= (1.0 - pbrInputs.metalness);
    
    if (transmissionFactor > 0.001) {        
        vec3 position = v_worldPosition;      // world
        mat3 viewToWorld = mat3(inverse(u_ViewMatrix));
        vec3 vView  = normalize(-v_position);        // view: surface -> camera
        vec3 vWorld = normalize(viewToWorld * vView); // world
        
        vec3 n = getNormal();  // view space
        vec3 nWorld = normalize(viewToWorld * n);
        
        vec3 transmissionColor = getIBLVolumeRefraction(pbrInputs, nWorld, vWorld, position, u_ModelMatrix, baseColor);
        
        diffuse = mix(diffuse, transmissionColor, transmissionFactor);
        //ret = vec3(transmissionFactor, transmissionFactor, transmissionFactor);;
    }
#endif
    ret = diffuse + specular;
    
    return ret;
}

// Basic Lambertian diffuse
// Implementation from Lambert's Photometria https://archive.org/details/lambertsphotome00lambgoog
// See also [1], Equation 1
vec3 diffuse(PBRInfo pbrInputs)
{
    return pbrInputs.diffuseColor / M_PI;
}


// The following equation models the Fresnel reflectance term of the spec equation (aka F())
// Implementation of fresnel from [4], Equation 15
vec3 specularReflection(PBRInfo pbrInputs)
{
    return pbrInputs.reflectance0 + (pbrInputs.reflectance90 - pbrInputs.reflectance0) 
        * pow(clamp(1.0 - pbrInputs.VdotH, 0.0, 1.0), 5.0);
}

// This calculates the specular geometric attenuation (aka G()),
// where rougher material will reflect less light back to the viewer.
// This implementation is based on [1] Equation 4, and we adopt their modifications to
// alphaRoughness as input as originally proposed in [2].
float geometricOcclusion(PBRInfo pbrInputs)
{
    float NdotL = pbrInputs.NdotL;
    float NdotV = pbrInputs.NdotV;
    float r = pbrInputs.alphaRoughness;

    float attenuationL = 2.0 * NdotL / (NdotL + sqrt(r * r + (1.0 - r * r) * (NdotL * NdotL)));
    float attenuationV = 2.0 * NdotV / (NdotV + sqrt(r * r + (1.0 - r * r) * (NdotV * NdotV)));
    return attenuationL * attenuationV;
}

// The following equation(s) model the distribution of microfacet normals across the area being drawn (aka D())
// Implementation from "Average Irregularity Representation of a Roughened Surface for Ray Reflection" by T. S. Trowbridge, and K. P. Reitz
// Follows the distribution function recommended in the SIGGRAPH 2013 course notes from EPIC Games [1], Equation 3.
float microfacetDistribution(PBRInfo pbrInputs)
{
    //pbrInputs.alphaRoughness = 0.5;
    float roughnessSq = pbrInputs.alphaRoughness * pbrInputs.alphaRoughness;
    //float f = (pbrInputs.NdotH * roughnessSq - pbrInputs.NdotH) * pbrInputs.NdotH + 1.0;
    float f = (pbrInputs.NdotH * pbrInputs.NdotH) * (roughnessSq - 1.0) + 1.0;
    return roughnessSq / (M_PI * f * f);
}

#ifdef HAS_ANISOTROPY
// GGX Distribution Anisotropic (Same as Babylon.js)
// https://blog.selfshadow.com/publications/s2012-shading-course/burley/s2012_pbs_disney_brdf_notes_v3.pdf Addenda
float D_GGX_anisotropic(float NdotH, float TdotH, float BdotH, float anisotropy, float at, float ab)
{
    float a2 = at * ab;
    vec3 f = vec3(ab * TdotH, at * BdotH, a2 * NdotH);
    float w2 = a2 / dot(f, f);
    return a2 * w2 * w2 / M_PI;
}

// GGX Mask/Shadowing Anisotropic (Same as Babylon.js - smithVisibility_GGXCorrelated_Anisotropic)
// Heitz http://jcgt.org/published/0003/02/03/paper.pdf
float V_GGX_anisotropic(float NdotL, float NdotV, float BdotV, float TdotV, float TdotL, float BdotL, float at, float ab)
{
    float GGXV = NdotL * length(vec3(at * TdotV, ab * BdotV, NdotV));
    float GGXL = NdotV * length(vec3(at * TdotL, ab * BdotL, NdotL));
    float v = 0.5 / (GGXV + GGXL);
    return clamp(v, 0.0, 1.0);
}

vec3 BRDF_specularGGXAnisotropy(float alphaRoughness, float anisotropy, vec3 n, vec3 v, vec3 l, vec3 h, vec3 t, vec3 b)
{
    // Roughness along the anisotropy bitangent is the material roughness, while the tangent roughness increases with anisotropy.
    float at = mix(alphaRoughness, 1.0, anisotropy * anisotropy);
    float ab = clamp(alphaRoughness, 0.001, 1.0);

    float NdotL = clamp(dot(n, l), 0.0, 1.0);
    float NdotH = clamp(dot(n, h), 0.001, 1.0);
    float NdotV = dot(n, v);

    float V = V_GGX_anisotropic(NdotL, NdotV, dot(b, v), dot(t, v), dot(t, l), dot(b, l), at, ab);
    float D = D_GGX_anisotropic(NdotH, dot(t, h), dot(b, h), anisotropy, at, ab);

    return vec3(V * D);
}
#endif

// dlgmlals3
void main()
{
    float perceptualRoughness = u_roughnessFactor;
    float metallic = u_metallicFactor;

#ifdef HAS_METALROUGHNESSMAP
    // Roughness is stored in the 'g' channel, metallic is stored in the 'b' channel.
    // This layout intentionally reserves the 'r' channel for (optional) occlusion map data
    vec4 mrSample = texture(u_metallicRoughnessTexture, v_uv);
    perceptualRoughness = mrSample.g * perceptualRoughness;
    metallic = mrSample.b * metallic;
#endif


    perceptualRoughness = clamp(perceptualRoughness, c_MinRoughness, 1.0);
    metallic = clamp(metallic, 0.0, 1.0);
    // Roughness is authored as perceptual roughness; as is convention,
    // convert to material roughness by squaring the perceptual roughness [2].
    float alphaRoughness = perceptualRoughness * perceptualRoughness;


    // The albedo may be defined from a base texture or a flat color
#ifdef HAS_BASECOLORMAP
    vec4 baseColor = texture(u_baseColorTexture, v_uv) * u_baseColorFactor;
#else
    vec4 baseColor = u_baseColorFactor;
#endif

    vec3 f0 = vec3(0.04);
    vec3 diffuseColor = baseColor.rgb * (vec3(1.0) - f0);
    diffuseColor *= 1.0 - metallic;
    vec3 specularColor = mix(f0, baseColor.rgb, metallic);

    // Compute reflectance.
    float reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);

    // For typical incident reflectance range (between 4% to 100%) set the grazing reflectance to 100% for typical fresnel effect.
    // For very low reflectance range on highly diffuse objects (below 4%), incrementally reduce grazing reflecance to 0%.
    float reflectance90 = clamp(reflectance * 25.0, 0.0, 1.0);
    vec3 specularEnvironmentR0 = specularColor.rgb;
    vec3 specularEnvironmentR90 = vec3(1.0, 1.0, 1.0) * reflectance90;

    vec3 n = getNormal();                             // normal at surface point
    // vec3 v = vec3( 0.0, 0.0, 1.0 );        // Vector from surface point to camera
    vec3 v = normalize(-v_position);                       // Vector from surface point to camera
    // vec3 l = normalize(u_LightDirection);             // Vector from surface point to light
    vec3 l = normalize(vec3( 1.0, 1.0, 1.0 ));             // Vector from surface point to light
    // vec3 l = vec3( 0.0, 0.0, 1.0 );             // Vector from surface point to light
    vec3 h = normalize(l+v);                          // Half vector between both l and v
    vec3 reflection = -normalize(reflect(v, n));

    float NdotL = clamp(dot(n, l), 0.001, 1.0);
    float NdotV = abs(dot(n, v)) + 0.001;
    float NdotH = clamp(dot(n, h), 0.0, 1.0);
    float LdotH = clamp(dot(l, h), 0.0, 1.0);
    float VdotH = clamp(dot(v, h), 0.0, 1.0);

    mat3 tbn = getTBNMatrix();
    vec3 anisotropicT = tbn[0].xyz;
    vec3 anisotropicB = tbn[1].xyz;

// struct PBRInfo
// {
//     float NdotL;                  // cos angle between normal and light direction
//     float NdotV;                  // cos angle between normal and view direction
//     float NdotH;                  // cos angle between normal and half vector
//     float LdotH;                  // cos angle between light direction and half vector
//     float VdotH;                  // cos angle between view direction and half vector
//     float perceptualRoughness;    // roughness value, as authored by the model creator (input to shader)
//     float metalness;              // metallic value at the surface
//     vec3 reflectance0;            // full reflectance color (normal incidence angle)
//     vec3 reflectance90;           // reflectance color at grazing angle
//     float alphaRoughness;         // roughness mapped to a more linear change in the roughness (proposed by [2])
//     vec3 diffuseColor;            // color contribution from diffuse lighting
//     vec3 specularColor;           // color contribution from specular lighting

//     float anisotropyStrength;     // anisotropy strength
//     vec3 anisotropicT;         // anisotropic tangent
//     vec3 anisotropicB;         // anisotropic bitangent    
// };

    PBRInfo pbrInputs = PBRInfo(
        NdotL,
        NdotV,
        NdotH,
        LdotH,
        VdotH,
        perceptualRoughness,
        metallic,
        specularEnvironmentR0,
        specularEnvironmentR90,
        alphaRoughness,
        diffuseColor,
        specularColor,        
        u_anisotropyStrength,
        anisotropicT,
        anisotropicB
    );
    // dlgmlals3
    //pbrInputs.alphaRoughness = 0.1;

    vec3 color = vec3(0.0);
    //vec3 l_specular_metal = vec3(0.0);
#ifdef HAS_ANISOTROPY
    float intensity = 0.5;
    // vec3 l_specular_metal = intensity * NdotL * BRDF_specularGGXAnisotropy(pbrInputs.alphaRoughness, pbrInputs.anisotropyStrength, 
    //     n, v, l, h, pbrInputs.anisotropicT, pbrInputs.anisotropicB);
    vec3 l_specular_metal = intensity * NdotL * BRDF_specularGGXAnisotropy(pbrInputs.alphaRoughness, pbrInputs.anisotropyStrength, 
        n, v, l, h, pbrInputs.anisotropicT, pbrInputs.anisotropicB);
    
    vec3 F = specularReflection(pbrInputs);    
    vec3 diffuseContrib = (1.0 - F) * diffuse(pbrInputs);
    vec3 specContrib = F * l_specular_metal;  // Fresnel 적용

    color = NdotL * (diffuseContrib + specContrib);
    //l_specular_dielectric = l_specular_metal;
    //color = vec3(pbrInputs.anisotropyStrength, 0.0, 0.0);
#else


    // Calculate the shading terms for the microfacet specular shading model
    float D = microfacetDistribution(pbrInputs);
    vec3 F = specularReflection(pbrInputs);
    float G = geometricOcclusion(pbrInputs);
    
    // Calculation of analytical lighting contribution
    vec3 diffuseContrib = (1.0 - F) * diffuse(pbrInputs);    
    vec3 specContrib = max(vec3(0.0), F * G * D / (4.0 * NdotL * NdotV));
    // vec3 color = NdotL * u_LightColor * (diffuseContrib + specContrib);    
    //diffuseContrib *= 3.5;
    //specContrib *= 5.5;
    color = NdotL * (diffuseContrib + specContrib);    // assume light color vec3(1, 1, 1)    
#endif


    // Calculate lighting contribution from image based lighting source (IBL)
// #ifdef USE_IBL
    color += getIBLContribution(pbrInputs, n, reflection, baseColor);
// #endif
    // Apply optional PBR terms for additional (optional) shading
#ifdef HAS_OCCLUSIONMAP
    float ao = texture(u_occlusionTexture, v_uv).r;
    color = mix(color, color * ao, u_occlusionStrength);
#endif

#ifdef HAS_EMISSIVEMAP
    vec3 emissive = texture(u_emissiveTexture, v_uv).rgb * u_emissiveFactor;
    color += emissive;
#endif    
    
    // // This section uses mix to override final color for reference app visualization
    // // of various parameters in the lighting equation.
    // color = mix(color, F, u_ScaleFGDSpec.x);
    // color = mix(color, vec3(G), u_ScaleFGDSpec.y);
    // color = mix(color, vec3(D), u_ScaleFGDSpec.z);
    // color = mix(color, specContrib, u_ScaleFGDSpec.w);

    // color = mix(color, diffuseContrib, u_ScaleDiffBaseMR.x);
    // color = mix(color, baseColor.rgb, u_ScaleDiffBaseMR.y);
    // color = mix(color, vec3(metallic), u_ScaleDiffBaseMR.z);
    // color = mix(color, vec3(perceptualRoughness), u_ScaleDiffBaseMR.w);
    
    // dlgmlals3
    //color = vec3(G);
    frag_color = vec4(color, baseColor.a);
}               