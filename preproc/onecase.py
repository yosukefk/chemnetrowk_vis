from abc import ABC, abstractmethod
import pandas as pd

class OneCaseABC(ABC):

    def __init__(self, unitconv=1., ignored_materials=[], condense_defs={}, condense_pgrp=False):

        self.unitconv = unitconv
        self.ignored_materials = ignored_materials

        # condense species
        # condense_defs condenses arbitrarily set of species
        # consend_pgrp == True condenses pgrp (product groups) as well
        def _proc_condense(condense_defs):

            if condense_defs is None or len(condense_defs) == 0: return None

            lst = []
            for grp,members in condense_defs.items():
                # TODO check for dups...
                lst.extend(
                        [{'material': _, 'grouped':grp} for _ in members])

            df = pd.DataFrame(lst).set_index('material')
            return df

        if condense_pgrp:
            #
            if inpdat is None:
                raise ValueError('need to pass inpdat when condens_pgrp is True')
            #x = pd.DataFrame([{'group':_.keys[0], 'member':_.keys[1]} for _ in db_inp['pgrp_i']])
            #x = x.groupby('group')['member'].apply(list).to_dict()
            x = inpdat['dct_pgrp_defs']

            if condense_defs is None:
                condense_defs = x
            else:
                condense_defs = {**condense_defs, **x}

        self.condense_pgrp = condense_pgrp
        self.condense_defs = _proc_condense(condense_defs)

        self._df_material = None
        self._df_process = None
        self._df_iom = None
        self._df_demand = None
        self._df_supply = None
        self._df_unconstrained_raw = None
        self._df_thru = None
        self._df_gross_cons = None
        self._df_gross_prod = None
        self._df_net_prod = None
        self._df_flux = None
        self._df_flux_byproc = None
        self._df_edges = None
        self._df_edges_byproc = None

        self._df_pgrp = None
        self._dct_pgrp_defs = None


    @property
    @abstractmethod
    def df_material(self):
        pass

    @property
    @abstractmethod
    def df_process(self):
        pass

    @property
    @abstractmethod
    def df_iom(self):
        pass

    @property
    @abstractmethod
    def df_demand(self):
        pass

    @property
    @abstractmethod
    def df_supply(self):
        pass

    @property
    @abstractmethod
    def df_unconstrained_raw(self):
        pass

    @property
    @abstractmethod
    def df_pgrp(self):
        """product group definition"""
        pass

    @property
    @abstractmethod
    def df_pgrp_defs(self):
        """product group definition"""
        pass

    @property
    @abstractmethod
    def df_flux(self):
        """maximum of absolute value of gross consumption/production for each meterial"""
        pass

    @property
    @abstractmethod
    def df_gross_cons(self):
        """dataframe for gross consumption array"""
        pass

    @property
    @abstractmethod
    def df_gross_prod(self):
        """dataframe for gross production array"""
        pass

    @property
    @abstractmethod
    def df_net_prod(self):
        """dataframe for net consumption array"""
        pass
        

    @property
    @abstractmethod
    def df_flux_byproc(self):
        """same as df_thru, except that value is called "flux", not thru"""
        pass

    @property
    @abstractmethod
    def df_thru(self):
        """dataframe for throughput array

        one column of value, named "thru"
        MultiIndex of material/process
        """
        pass


    @property
    @abstractmethod
    def df_edges(self):
        pass

    @property
    @abstractmethod
    def df_edges_byproc(self):
        pass


    
    def _mk_flux(self):
        """Flux across node"""
        df_flux = pd.concat([
            self.df_gross_cons.rename({'gross_cons':'flux'}, axis=1).reset_index(), 
            self.df_gross_prod.rename({'gross_prod':'flux'}, axis=1).reset_index()])
        df_flux.flux = df_flux.flux.abs()
        self._df_flux = df_flux.groupby('material').max()

    def _mk_flux_byproc(self):
        self._df_flux_byproc = self.df_thru.copy()
        self._df_flux_byproc.columns=['flux']
        


    def _mk_edges(self):
        """helper function to generate edgelist """
        dfa = self.df_thru.reset_index('material')
        dct = {}
        dcta = {}
        for proc in dfa.index.unique():
            df = dfa.loc[[proc], :]
            dfc = df.loc[df.thru<0, :]
            dfp = df.loc[df.thru>0, :]
            totc = dfc.thru.sum()
            totp = dfp.thru.sum()
            err = totc + totp

            for c in dfc.itertuples():
                for p in dfp.itertuples():
                    e = dct.setdefault((c.material, p.material), {'flux': 0, })
                    v = c.thru * p.thru / totc
                    e['flux'] += v
                    dcta[(c.material, p.material, proc)] = {'flux': v}

        idx = pd.MultiIndex.from_tuples(dct.keys(), names = ['material0', 'material1'])
        self._df_edges = pd.DataFrame(dct.values(), index=idx)

        idx = pd.MultiIndex.from_tuples(dcta.keys(), names = ['material0', 'material1', 'process'])
        self._df_edges_byproc = pd.DataFrame(dcta.values(), index=idx)
